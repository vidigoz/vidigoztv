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

- [ ] Reutilizar el pool ya existente (mismo patrón que `netlify/functions/stats.js` / `track.js`: `process.env.vidigoztv_db_id`, con fallback a leer `.env` local)
- [ ] Crear archivo `netlify/functions/_db.js` con un `getPool()` compartido (hoy está duplicado en `stats.js` y `track.js` — aprovechar para centralizarlo y que las functions nuevas lo importen también)
- [ ] Diseñar tabla `subscribers`:
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
- [ ] Diseñar tabla `sends`:
  - `id` (uuid)
  - `notion_page_id` (text)
  - `subject` (text)
  - `scheduled_at` (timestamptz, nullable — null = manual, con fecha = el cron lo respeta)
  - `sent` (boolean, default false)
  - `sent_at` (timestamptz, nullable)
  - `recipients_count` (integer, default 0)
  - `created_at` (timestamptz, default now())
- [ ] Diseñar tabla `send_events` (log de rebotes/quejas/bajas por envío):
  - `id` (uuid)
  - `send_id` (fk a `sends`)
  - `subscriber_id` (fk a `subscribers`)
  - `event_type` (text: `delivered` / `bounced` / `complained` / `unsubscribed`)
  - `created_at` (timestamptz, default now())
- [ ] Diseñar tabla `send_recipients` (para open rate / click rate, columna 14):
  - `id` (uuid)
  - `send_id` (fk a `sends`)
  - `subscriber_id` (fk a `subscribers`)
  - `resend_email_id` (text)
  - `delivered_at`, `opened_at`, `first_clicked_at`, `bounced_at`, `complained_at` (timestamptz, nullable)
- [ ] Script SQL único (`netlify/functions/_migrations/001_newsletter.sql` o similar) con `CREATE TABLE IF NOT EXISTS` para las 5 tablas + índices en `email`, `confirm_token`, `unsubscribe_token`, `status`
- [ ] Correr la migración manualmente una vez contra `vidigoztv_db_id` (script suelto en Node, tipo `node scripts/migrate.js`) y confirmar con un `SELECT` que las tablas existen

---

## Columna 2 — Endpoint de alta (double opt-in) — reemplaza `newsletter.js` actual

- [ ] Reescribir `netlify/functions/newsletter.js`:
  - [ ] Validar formato de email (ya existe `EMAIL_RE`, se reutiliza)
  - [ ] Generar `confirm_token` y `unsubscribe_token` (`crypto.randomUUID()`)
  - [ ] Insertar en `subscribers` con `status = pending` (upsert: si el email ya existe y está `pending`, reenviar confirmación; si ya está `active`, responder éxito sin reenviar nada — mismo comportamiento no-fricción que hoy)
  - [ ] Disparar correo de confirmación vía Resend con link `vidigoztv.com/taller/newsletter/confirmar?token=XXX` (o el dominio real del sitio)
- [ ] Crear `netlify/functions/newsletter-confirm.js` (`GET /.netlify/functions/newsletter-confirm?token=XXX`):
  - [ ] Buscar por `confirm_token`, pasar a `status = active`, guardar `confirmed_at`
  - [ ] Redirigir (302) a una página bonita `/confirmado.html` en el sitio
- [ ] Actualizar el form de `index.html` (ya existe, solo cambia qué endpoint golpea — sigue siendo `/.netlify/functions/newsletter`, el contrato de respuesta `{success, alreadySubscribed}` se mantiene igual para no tocar el JS del front)
- [ ] Espejo en `server.js` local: mismo endpoint, mismo comportamiento (mantener paridad dev/prod como ya hacen `newsletter.js` / `track.js` / `stats.js` hoy)
- [ ] Probar flujo completo con correo propio: suscribirse desde index.html → recibir confirmación → confirmar → verificar `status = active` en Postgres

---

## Columna 3 — Endpoint de baja

- [ ] Crear `netlify/functions/newsletter-unsubscribe.js` (`GET /.netlify/functions/newsletter-unsubscribe?token=XXX`)
- [ ] Buscar por `unsubscribe_token`, pasar a `status = unsubscribed`, guardar `unsubscribed_at`
- [ ] Página de confirmación simple e instantánea (sin pedir razón, sin fricción)
- [ ] Verificar que el link de baja vaya en la plantilla de TODOS los correos (columna 5)

---

## Columna 4 — Cuenta y dominio en Resend

- [ ] Crear cuenta en Resend (free: 3,000 correos/mes)
- [ ] Agregar el dominio del sitio, configurar SPF / DKIM / DMARC
- [ ] Esperar verificación DNS
- [ ] Guardar `RESEND_API_KEY` en Netlify env vars (Site settings → Environment variables) + en `.env` local para dev, siguiendo el mismo patrón que `integration_token`/`vidigoztv_db_id`
- [ ] Envío de prueba a correo propio para confirmar entregabilidad

---

## Columna 5 — Plantilla de correo (HTML)

- [ ] Plantilla con la estética del sitio (mismos colores/tipografía que `taller/index.html`: fondo `#050410`, acento `#e2632f`, Space Grotesk + Manrope)
- [ ] Estructura: header con nombre del canal, título de historia, cuerpo formateado desde Notion, imagen si aplica, footer con redes + link de baja (`unsubscribe_token` dinámico) + nombre/contacto
- [ ] Usar tablas HTML para compatibilidad Gmail/Outlook/Apple Mail
- [ ] Guardar como módulo reutilizable, ej. `netlify/functions/_email-template.js`, exportando una función `renderEmail({titulo, cuerpo, unsubscribeLink})`

---

## Columna 6 — Función de envío (Notion + Postgres + Resend)

- [ ] Crear `netlify/functions/newsletter-send.js` — invocable manualmente desde el dashboard (`POST`, requiere pasar por la auth de `/taller`) y reutilizable desde el cron (columna 8)
- [ ] Lógica:
  - [ ] Recibir `notion_page_id` (o buscar la próxima con `Status = Listo para enviar` si no se pasa uno)
  - [ ] Extraer título/contenido de Notion (reutilizar cliente `@notionhq/client` ya en uso)
  - [ ] Renderizar con la plantilla (columna 5)
  - [ ] Traer `subscribers` con `status = active` de Postgres
  - [ ] Por cada uno, generar link de baja con su `unsubscribe_token`
  - [ ] Enviar vía Resend (batch API si aplica, respetar rate limits)
  - [ ] Guardar `resend_email_id` por destinatario en `send_recipients` (para columna 14)
  - [ ] Insertar en `sends` (`recipients_count`, `sent = true`, `sent_at`)
  - [ ] Actualizar `Status` en Notion a `Enviado`
- [ ] Manejo de errores: reintentos sin duplicar a quien ya recibió (marcar progreso por destinatario, no todo-o-nada)
- [ ] Probar con historia de prueba, enviando solo al correo propio

---

## Columna 7 — Webhooks de Resend

- [ ] Crear `netlify/functions/newsletter-webhook.js` (`POST /.netlify/functions/newsletter-webhook`)
- [ ] Configurar el webhook en el dashboard de Resend apuntando a esa URL
- [ ] Verificar firma del webhook (Resend firma sus payloads — validar antes de procesar)
- [ ] `bounced` → `subscribers.status = bounced`
- [ ] `complained` → `subscribers.status = unsubscribed` inmediato
- [ ] `email.opened` / `email.clicked` → actualizar `send_recipients` (columna 14)
- [ ] Insertar en `send_events` para historial
- [ ] Probar con simulador de Resend o un rebote real de prueba

---

## Columna 8 — Cron (Netlify Scheduled Functions)

- [ ] Crear `netlify/functions/newsletter-cron.js`, exportando `export const config = { schedule: '0 9 * * *' }` (9am UTC ≈ 3am Tecate) — sintaxis nativa de Netlify Scheduled Functions, no requiere servicio externo
- [ ] Lógica: buscar en `sends` lo que tenga `scheduled_at <= now() AND sent = false`; si no hay nada, revisar Notion por `Status = Listo para enviar` sin `scheduled_at` asociado
- [ ] Si hay algo que enviar, invoca la misma lógica de `newsletter-send.js` (extraer a función compartida, ej. `_send-logic.js`, para no duplicar código entre el endpoint manual y el cron)
- [ ] Logging: Netlify guarda el output de cada corrida de scheduled function en su dashboard de Functions — no requiere nada adicional
- [ ] Probar: programar algo desde el dashboard antes de dormir, confirmar en la mañana que salió solo

---

## Columna 9 — Lanzamiento real

- [ ] Confirmar que la tabla `subscribers` tiene al menos algunos `active` (los que agregues manualmente desde el dashboard, columna 13, o los que se confirmen orgánicamente)
- [ ] Primer envío real con una historia nueva
- [ ] Verificar en Resend: entregado, sin rebotes
- [ ] Verificar que el link de baja funciona de principio a fin
- [ ] A partir de aquí: marcar `Listo para enviar` en Notion + dejar que el cron lo tome, o disparar manual desde el dashboard

---

## Columna 10 — Dashboard: base y ruta

- [ ] Crear `site/taller/newsletter/index.html` — sin auth propia: cae bajo `/taller/*` que ya protege `netlify/edge-functions/auth.js` (config `path: ['/taller', '/taller/*']` ya lo cubre, no hay que tocar ese archivo)
- [ ] Agregar tarjeta "Newsletter" al hub `taller/index.html` (mismo patrón visual que Vidiclip/Vidiwrite/Vidiserial/Analytics)
- [ ] Agregar redirect en `netlify.toml`: `/taller/newsletter → /taller/newsletter/index.html` (mismo patrón que las demás herramientas)
- [ ] Layout base con navegación entre 4 secciones: Historias / Programados / Historial / Suscriptores — mismo estilo visual que `taller/analytics/index.html` para consistencia

## Columna 11 — Dashboard: historias y vista previa

- [ ] `netlify/functions/newsletter-notion-list.js`: lista páginas de Notion con su `Status` (reutiliza credenciales ya en `.env`/env vars — `db_id` / `integration_token`)
- [ ] Pantalla que muestra la lista (título, estado, última edición)
- [ ] Al seleccionar una: `netlify/functions/newsletter-preview.js` trae el contenido de Notion, lo renderiza con la plantilla (columna 5), lo regresa como HTML
- [ ] Vista previa en iframe dentro del dashboard
- [ ] Botón "Enviar ahora" → llama `newsletter-send.js` directo (sin `scheduled_at`)
- [ ] Botón "Programar" → selector fecha/hora, crea/actualiza fila en `sends` con `scheduled_at`

## Columna 12 — Dashboard: programados y cancelación

- [ ] Pantalla "Programados": lista `sends` con `scheduled_at` futuro y `sent = false`
- [ ] Botón "Cancelar programación" → pone `scheduled_at = NULL` en esa fila (vuelve a manual)

## Columna 13 — Dashboard: historial y suscriptores

- [ ] Pantalla "Historial": `sends` + `send_events` — fecha, destinatarios, rebotes, quejas, open rate / click rate (columna 14) por envío
- [ ] Pantalla "Suscriptores":
  - [ ] Lista desde Postgres con estado (activo/pendiente/baja/rebotado) y conteo total arriba
  - [ ] **Agregar suscriptor manual**: formulario simple (email + nombre opcional) que inserta directo con `status = active` — para cuando quieras subir a mano los correos que ya tenías fuera del sistema
  - [ ] **Importar lista/CSV** (opcional, mismo endpoint acepta un array de emails): pega o sube varios correos de una vez, todos entran como `active`
  - [ ] Los suscriptores que se den de alta solos desde el formulario del sitio siguen su flujo normal (`pending` → `active` tras confirmar) y aparecen aquí automáticamente, sin que tengas que hacer nada
  - [ ] Exportar CSV de activos (opcional)

## Columna 14 — Tracking de aperturas y clics

- [ ] Activar tracking de aperturas/clics en la config del dominio en Resend
- [ ] `send_recipients` ya creada en columna 1
- [ ] `newsletter-send.js` guarda `resend_email_id` por destinatario al enviar (columna 6)
- [ ] `newsletter-webhook.js` escucha `email.opened` / `email.clicked` y actualiza el timestamp correspondiente (columna 7)
- [ ] Calcular open rate = abiertos ÷ entregados, click rate = clics ÷ entregados, por envío
- [ ] Mostrar en "Historial" (columna 13)
- [ ] Nota: Apple Mail precarga el pixel de apertura automáticamente desde 2021 — el open rate estará inflado si buena parte de la lista usa Mail/iPhone. No es un bug del sistema. Click rate es más confiable.

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
