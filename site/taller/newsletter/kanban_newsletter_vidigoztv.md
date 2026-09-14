# Kanban — Sistema de newsletter (VidigozTV / Taller)

Adaptado al stack real del sitio: **Netlify Functions** (no Next.js API routes), **Netlify Edge Function** ya existente para proteger `/taller/*`, **Postgres compartido** (`vidigoztv_db_id`, ya usado por `events`), **Netlify Scheduled Functions** para el cron (no GitHub Actions), y **Resend** para el envío. El dashboard vive en `/taller/newsletter`, dentro del hub de Taller, protegido por la misma contraseña que ya protege todo `/taller/*`.

Cómo usar este documento: cada `##` es una columna del kanban. Cada `- [ ]` es una tarea. Están en orden de dependencia.

---

## Decisiones de adaptación (vs. el .md original)

- **Sin Neon nuevo** → se reutiliza el Postgres ya conectado como `vidigoztv_db_id` (env var en Netlify + `.env` local). Tablas nuevas en el mismo pool que ya usa `events`.
- **Sin Next.js API routes** → todo son **Netlify Functions** (`netlify/functions/*.js`), igual que `newsletter.js`, `track.js`, `stats.js` ya existentes.
- **Sin GitHub Actions / Render Cron** → **Netlify Scheduled Functions** (`netlify/functions/newsletter-cron.js` + bloque `[[scheduled_functions]]` o export `schedule` en `netlify.toml`), corre dentro de la misma plataforma donde ya vive el sitio.
- **Auth del dashboard** → no hay que crear nada nuevo: `netlify/edge-functions/auth.js` ya protege `/taller` y `/taller/*` con `TALLER_PASSWORD`. `/taller/newsletter` cae automáticamente bajo esa protección.
- **Notion sigue siendo el editor de historias** (`db_id` / `NOTION_DB_ID`), igual que en el .md original — no se toca ese flujo, solo se lee desde ahí para armar el correo.
- **`newsletter.js` actual se reemplaza**: hoy escribe directo a una base de Notion (`newsletter_db_id`) sin opt-in ni baja. Pasa a escribir en Postgres con `status=pending` + correo de confirmación. La base de Notion vieja se deja de usar para altas nuevas (puede quedar como archivo histórico).
- **Arranca con 0 suscriptores reales** en la tabla nueva — no se migra nada automático de Notion. El dashboard incluye una pantalla para **agregar suscriptores a mano** (uno por uno o pegando una lista/CSV) para cuando decidas importar los que ya tenías.
- **Vidiclip inyecta env vars a `localStorage` vía server.js** — mismo patrón (`serveVidiclip`) podría reutilizarse si el dashboard nuevo necesitara precargar algo, pero no debería ser necesario: el dashboard llama a sus propias functions, no usa Notion API desde el cliente.

---

## Columna 1 — Base de datos (Postgres compartido, `vidigoztv_db_id`)

- [x] Reutilizar el pool ya existente (mismo patrón que `netlify/functions/stats.js` / `track.js`: `process.env.vidigoztv_db_id`, con fallback a leer `.env` local)
- [x] Crear archivo `netlify/functions/_db.js` con un `getPool()` compartido (las functions nuevas lo importan; `stats.js`/`track.js` se dejaron intactos para no arriesgar código de producción funcionando)
- [x] Diseñar tabla `subscribers`:
  - `id` (uuid, primary key, `gen_random_uuid()`)
  - `email` (text, unique, not null)
  - `nombre` (text, nullable — ya se captura hoy en el form de index.html)
  - `status` (text: `pending` / `active` / `unsubscribed` / `bounced`)
  - `origen` (text: `index.html` / `historias.html` / `manual` / `otro`)
  - `confirm_token` (text)
  - `unsubscribe_token` (text, único)
  - `created_at` (timestamptz, default now())
  - `confirmed_at` (timestamptz, nullable)
  - `unsubscribed_at` (timestamptz, nullable)
- [x] Diseñar tabla `sends`:
  - `id` (uuid)
  - `notion_page_id` (text)
  - `subject` (text)
  - `scheduled_at` (timestamptz, nullable — null = manual, con fecha = el cron lo respeta)
  - `sent` (boolean, default false)
  - `sent_at` (timestamptz, nullable)
  - `recipients_count` (integer, default 0)
  - `created_at` (timestamptz, default now())
- [x] Diseñar tabla `send_events` (log de rebotes/quejas/bajas por envío):
  - `id` (uuid)
  - `send_id` (fk a `sends`)
  - `subscriber_id` (fk a `subscribers`)
  - `event_type` (text: `delivered` / `bounced` / `complained` / `unsubscribed`)
  - `created_at` (timestamptz, default now())
- [x] Diseñar tabla `send_recipients` (para open rate / click rate, columna 14):
  - `id` (uuid)
  - `send_id` (fk a `sends`)
  - `subscriber_id` (fk a `subscribers`)
  - `resend_email_id` (text)
  - `delivered_at`, `opened_at`, `first_clicked_at`, `bounced_at`, `complained_at` (timestamptz, nullable)
- [x] Script SQL único (`netlify/functions/_migrations/001_newsletter.sql` o similar) con `CREATE TABLE IF NOT EXISTS` para las 5 tablas + índices en `email`, `confirm_token`, `unsubscribe_token`, `status`
- [x] Correr la migración manualmente una vez contra `vidigoztv_db_id` (script suelto en Node, tipo `node scripts/migrate.js`) y confirmar con un `SELECT` que las tablas existen — corrida contra la DB real, `scripts/migrate.js`, confirmado con SELECT count(*) en las 4 tablas nuevas (0 filas al terminar)

---

## Columna 2 — Endpoint de alta (double opt-in) — reemplaza `newsletter.js` actual

- [x] Reescribir `netlify/functions/newsletter.js`:
  - [x] Validar formato de email (ya existe `EMAIL_RE`, se reutiliza)
  - [x] Generar `confirm_token` y `unsubscribe_token` (`crypto.randomUUID()`)
  - [x] Insertar en `subscribers` con `status = pending` (upsert: si el email ya existe y está `pending`, reenviar confirmación; si ya está `active`, responder éxito sin reenviar nada — mismo comportamiento no-fricción que hoy)
  - [x] Disparar correo de confirmación vía Resend con link a `/.netlify/functions/newsletter-confirm?token=XXX` (dominio derivado del propio request, con fallback a `SITE_URL`/`vidigoztv.com`)
- [x] Crear `netlify/functions/newsletter-confirm.js` (`GET /.netlify/functions/newsletter-confirm?token=XXX`):
  - [x] Buscar por `confirm_token`, pasar a `status = active`, guardar `confirmed_at`
  - [x] Redirigir (302) a una página bonita `/confirmado.html` en el sitio
- [x] Actualizar el form de `index.html` (no requirió cambios — sigue pegando a `/.netlify/functions/newsletter`, contrato `{success, alreadySubscribed}` verificado intacto con curl)
- [x] Espejo en `server.js` local: mismo endpoint, mismo comportamiento (mantener paridad dev/prod como ya hacen `newsletter.js` / `track.js` / `stats.js` hoy)
- [x] Probar flujo completo con correo propio: suscribirse desde el endpoint → confirmar con el token real generado en Postgres → verificado `status = active` en la DB real (envío de correo de confirmación no probado end-to-end por falta de RESEND_API_KEY — falla con gracia y queda logueado, sin romper el alta)

---

## Columna 3 — Endpoint de baja

- [x] Crear `netlify/functions/newsletter-unsubscribe.js` (`GET /.netlify/functions/newsletter-unsubscribe?token=XXX`)
- [x] Buscar por `unsubscribe_token`, pasar a `status = unsubscribed`, guardar `unsubscribed_at` — probado con token real contra Postgres
- [x] Página de confirmación simple e instantánea (sin pedir razón, sin fricción) — `site/baja.html`
- [x] Verificar que el link de baja vaya en la plantilla de TODOS los correos (columna 5) — `_email-template.js` y el correo de confirmación lo incluyen siempre

---

## Columna 4 — Cuenta y dominio en Resend

**Pendiente — requiere al humano, no se puede hacer desde el agente (cuenta, DNS, API key reales).** El código ya espera `RESEND_API_KEY` (y opcionalmente `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`) con el mismo patrón fallback-a-.env que las demás credenciales del repo — ver reporte final para el detalle exacto de cada variable.

- [ ] Crear cuenta en Resend (free: 3,000 correos/mes)
- [ ] Agregar el dominio del sitio, configurar SPF / DKIM / DMARC
- [ ] Esperar verificación DNS
- [ ] Guardar `RESEND_API_KEY` en Netlify env vars (Site settings → Environment variables) + en `.env` local para dev, siguiendo el mismo patrón que `integration_token`/`vidigoztv_db_id`
- [ ] Envío de prueba a correo propio para confirmar entregabilidad

---

## Columna 5 — Plantilla de correo (HTML)

- [x] Plantilla con la estética del sitio (mismos colores/tipografía que `taller/index.html`: fondo `#050410`, acento `#e2632f`, Space Grotesk + Manrope)
- [x] Estructura: header con nombre del canal, título de historia, cuerpo formateado desde Notion, imagen si aplica, footer con link de baja (`unsubscribe_token` dinámico) — sin sección de redes (no había un patrón previo de redes en el sitio del que replicar links)
- [x] Usar tablas HTML para compatibilidad Gmail/Outlook/Apple Mail
- [x] Guardar como módulo reutilizable `netlify/functions/_email-template.js`, exportando `renderEmail({titulo, cuerpo, imagenUrl, unsubscribeLink, siteUrl})` — verificado renderizando una historia real de Notion vía `newsletter-preview.js`

---

## Columna 6 — Función de envío (Notion + Postgres + Resend)

**Decisión de adaptación:** la DB de historias (`vidiclip_db`) tiene el campo `Estado` (tipo `status`) con opciones fijas Revision/Listo/Programado/Cancelado/Previo — Notion no permite agregar opciones a un campo `status` vía API, así que no existe (ni se puede crear sin editar el schema a mano en la UI) un valor "Listo para enviar". Se usa `Estado = Programado` (mismo criterio que ya usa `historias.js` para publicar en el sitio) como lista de candidatas, y el control de qué ya se envió vive enteramente en Postgres (`sends.notion_page_id` + `sent=true`) — no se reescribe `Estado` en Notion tras enviar.

- [x] Crear `netlify/functions/newsletter-send.js` — invocable manualmente (`POST`), protegido con la misma contraseña de Taller (ver nota de seguridad abajo), y reutilizable desde el cron (columna 8)
- [x] Lógica:
  - [x] Recibir `notionPageId` (o buscar la próxima `Estado = Programado` sin envío completado si no se pasa uno)
  - [x] Extraer título/contenido de Notion (reutiliza `@notionhq/client` vía `_notion-historias.js`)
  - [x] Renderizar con la plantilla (columna 5)
  - [x] Traer `subscribers` con `status = active` de Postgres
  - [x] Por cada uno, generar link de baja con su `unsubscribe_token`
  - [x] Enviar vía Resend (`_resend.js`, un correo por request — sin batch API; el volumen esperado no lo requiere, documentado como decisión simple)
  - [x] Guardar `resend_email_id` por destinatario en `send_recipients` (para columna 14)
  - [x] Insertar/actualizar `sends` (`recipients_count`, `sent = true` solo cuando todos los activos quedaron cubiertos, `sent_at`)
  - [ ] Actualizar `Status` en Notion a `Enviado` — NO implementado, ver decisión de adaptación arriba (no existe esa opción de status y no se puede crear vía API)
- [x] Manejo de errores: reintentos sin duplicar a quien ya recibió — `send_recipients` es la fuente de verdad de "ya recibió"; un reintento sobre el mismo `sendId` solo envía a los que faltan
- [x] Probar con historia real de Notion — probado end-to-end contra Postgres/Notion reales; el envío real a Resend NO se pudo probar (sin `RESEND_API_KEY`), falla con gracia y queda logueado por destinatario sin marcar el `send` como completo

**Nota de seguridad (no cubierta explícitamente por el plan):** las Netlify Functions (`/.netlify/functions/*`) NO caen bajo el edge function que protege `/taller/*` — son rutas distintas. Se agregó `netlify/functions/_taller-auth.js`, que valida la misma contraseña de Taller (Basic Auth) en todos los endpoints administrativos del newsletter (send, sends, subscribers, notion-list, preview). El navegador ya reenvía esas credenciales automáticamente al mismo origen una vez autenticado en `/taller`, así que el dashboard no necesita hacer nada especial.

---

## Columna 7 — Webhooks de Resend

- [x] Crear `netlify/functions/newsletter-webhook.js` (`POST /.netlify/functions/newsletter-webhook`)
- [ ] Configurar el webhook en el dashboard de Resend apuntando a esa URL — pendiente del humano (requiere cuenta Resend creada, columna 4)
- [x] Verificar firma del webhook (implementada verificación Svix, que es lo que usa Resend) — requiere `RESEND_WEBHOOK_SECRET` configurado; si no está presente, el webhook sigue funcionando pero sin verificar firma (documentado explícitamente en el código, no probado con webhook real por falta de cuenta Resend)
- [x] `bounced` → `subscribers.status = bounced`
- [x] `complained` → `subscribers.status = unsubscribed` inmediato
- [x] `email.opened` / `email.clicked` → actualizar `send_recipients` (columna 14)
- [x] Insertar en `send_events` para historial (bounced/complained)
- [ ] Probar con simulador de Resend o un rebote real de prueba — NO probado, requiere cuenta Resend real

---

## Columna 8 — Cron (Netlify Scheduled Functions)

- [x] Crear `netlify/functions/newsletter-cron.js` — el resto del repo usa CommonJS (`exports.handler`), así que el schedule se declaró en `netlify.toml` (`[functions."newsletter-cron"] schedule = "0 9 * * *"`) en vez de `export const config` (sintaxis ESM de Functions v2), para mantener consistencia con el resto del código — mismo resultado, 9am UTC ≈ 3am Tecate
- [x] Lógica (revisada tras auditoría — ver nota abajo): busca en `sends` lo que tenga `scheduled_at <= now() AND sent = false` y lo envía; si no hay nada programado, **no hace nada esa noche**. Ya no elige sola una historia "Programado" de Notion cuando no hay `scheduled_at` — eso habría disparado envíos reales a toda la lista sin que el usuario lo pidiera ese día, en cuanto hubiera `RESEND_API_KEY` configurada. Decisión confirmada explícitamente con el usuario.
- [x] Reutiliza la misma lógica de `newsletter-send.js` vía `_shared/send-logic.js` (función compartida `sendNewsletterForPage`), sin duplicar código
- [x] Logging: usa `console.log`/`console.error`, capturado automáticamente por Netlify en el dashboard de Functions
- [x] Probado invocando `newsletter-cron.js` directo en local contra Postgres/Notion reales: con la lista de `sends` programados vacía, responde `{ran:false, reason:'Nada programado'}` sin enviar nada — comportamiento seguro confirmado. El escenario "hay algo programado y vencido → se envía" se prueba manualmente igual que "Enviar ahora" (mismo código compartido); el disparo automático en producción real (Netlify Scheduled Function ejecutando sola de madrugada) no se puede probar sin desplegar, queda pendiente de observar tras el primer deploy.

---

## Columna 9 — Lanzamiento real

**Pendiente — todo esto requiere el sitio desplegado en Netlify con RESEND_API_KEY configurado; no se puede completar desde el agente.**

- [ ] Confirmar que la tabla `subscribers` tiene al menos algunos `active` (los que agregues manualmente desde el dashboard, columna 13, o los que se confirmen orgánicamente) — nota: `victor@ionind.com` ya quedó como suscriptor `active` de las pruebas hechas durante esta implementación, útil como primer destinatario de prueba real
- [ ] Primer envío real con una historia nueva
- [ ] Verificar en Resend: entregado, sin rebotes
- [ ] Verificar que el link de baja funciona de principio a fin
- [ ] A partir de aquí: marcar `Listo para enviar` en Notion + dejar que el cron lo tome, o disparar manual desde el dashboard

---

## Columna 10 — Dashboard: base y ruta

- [x] Crear `site/taller/newsletter/index.html` — sin auth propia: cae bajo `/taller/*` que ya protege `netlify/edge-functions/auth.js`, no se tocó ese archivo
- [x] Agregar tarjeta "Newsletter" al hub `taller/index.html` (mismo patrón visual que Vidiclip/Vidiwrite/Vidiserial/Analytics) — verificado que aparece en el HTML servido
- [x] Agregar redirect en `netlify.toml`: `/taller/newsletter → /taller/newsletter/index.html` (mismo patrón que las demás herramientas)
- [x] Layout base con navegación entre 4 secciones: Historias / Programados / Historial / Suscriptores — mismo estilo visual (`#050410`/`#16142a`/`#e2632f`, Space Grotesk + Manrope) que `taller/analytics/index.html`

## Columna 11 — Dashboard: historias y vista previa

- [x] `netlify/functions/newsletter-notion-list.js`: lista páginas de Notion (`Estado = Programado`) cruzadas con su estado de envío en `sends` — probado con datos reales de Notion
- [x] Pantalla que muestra la lista (título, estado de envío, última edición)
- [x] Al seleccionar una: `netlify/functions/newsletter-preview.js` trae el contenido de Notion, lo renderiza con la plantilla (columna 5), lo regresa como HTML — probado con una historia real
- [x] Vista previa en iframe dentro del dashboard
- [x] Botón "Enviar ahora" → llama `newsletter-send.js` directo (sin `scheduled_at`)
- [x] Botón "Programar" → selector fecha/hora (`datetime-local`), crea/actualiza fila en `sends` con `scheduled_at` vía `newsletter-sends.js`

## Columna 12 — Dashboard: programados y cancelación

- [x] Pantalla "Programados": lista `sends` con `scheduled_at` futuro y `sent = false` — probado con un `schedule` real
- [x] Botón "Cancelar programación" → pone `scheduled_at = NULL` en esa fila (vuelve a manual) — probado

## Columna 13 — Dashboard: historial y suscriptores

- [x] Pantalla "Historial": `sends` + estadísticas agregadas de `send_recipients` — fecha, destinatarios, rebotes, quejas, open rate / click rate (columna 14) por envío
- [x] Pantalla "Suscriptores":
  - [x] Lista desde Postgres con estado (activo/pendiente/baja/rebotado) y conteo total arriba — probado con datos reales
  - [x] **Agregar suscriptor manual**: formulario simple (email + nombre opcional) que inserta directo con `status = active` — probado
  - [x] **Importar lista/CSV** (mismo endpoint acepta un array de emails, parseado del textarea por líneas/comas): entran como `active`
  - [x] Los suscriptores que se den de alta solos desde el formulario del sitio siguen su flujo normal (`pending` → `active` tras confirmar) y aparecen aquí automáticamente
  - [x] Exportar CSV de activos — endpoint `?format=csv` con `Content-Disposition: attachment`

## Columna 14 — Tracking de aperturas y clics

- [ ] Activar tracking de aperturas/clics en la config del dominio en Resend — pendiente del humano (columna 4)
- [x] `send_recipients` ya creada en columna 1
- [x] `newsletter-send.js` / `_send-logic.js` guarda `resend_email_id` por destinatario al enviar (columna 6)
- [x] `newsletter-webhook.js` escucha `email.opened` / `email.clicked` y actualiza el timestamp correspondiente (columna 7)
- [x] Calcular open rate = abiertos ÷ entregados, click rate = clics ÷ entregados, por envío — en `newsletter-sends.js` (scope=history) y espejado en `server.js`
- [x] Mostrar en "Historial" (columna 13)
- [x] Nota sobre Apple Mail incluida textualmente en la pantalla de Historial del dashboard

---

## Notas de decisiones ya tomadas (para no reabrir la discusión)

- La lista de suscriptores vive en **Postgres** (`vidigoztv_db_id`, el mismo que ya usa `events`), no en Notion — Notion sigue siendo solo el editor de contenido de las historias.
- El envío se hace con **Resend**, no SMTP propio.
- El alta usa **double opt-in**.
- El dashboard vive en **`/taller/newsletter`**, protegido por la misma Basic Auth de `/taller/*` que ya existe (`netlify/edge-functions/auth.js`) — no se crea autenticación nueva.
- El cron corre como **Netlify Scheduled Function**, en la misma plataforma donde ya está desplegado el sitio — no GitHub Actions, no Render.
- Manual y automático son el mismo flujo con `scheduled_at` opcional (vacío = manual, con fecha = el cron lo respeta). "Desprogramar" = borrar esa fecha.
- Se arranca con **0 suscriptores** en la tabla nueva. Los correos viejos que quedaron en la base de Notion (`newsletter_db_id`) NO se migran automáticamente — el dashboard trae una pantalla para agregarlos a mano (uno por uno o en lote) cuando el usuario decida. Los correos nuevos que entran por el formulario del sitio se dan de alta solos vía double opt-in.
- El endpoint `/.netlify/functions/newsletter` cambia de destino (Notion → Postgres) pero mantiene el mismo contrato de request/response, así que el formulario ya existente en `index.html` no necesita cambios de JS.
- El open rate requiere `send_recipients` con un ID por destinatario, no solo el conteo total.
