# StoryForge ✦ Editor de Historias con IA

Editor de historias narrativas con sugerencias de IA en tiempo real e integración con Notion.

## Instalación

```bash
# 1. Instala dependencias
npm install

# 2. Inicia el servidor
npm start
```

Luego abre tu navegador en: **http://localhost:3900**

## Uso

1. **Escribe tu historia** en el panel izquierdo
2. **Marca los fragmentos** que quieres que la IA complete con `[[descripción]]`
   - Ejemplo: `Era el año 1344 en las orillas de [[bosque cercano a Milán]] ...`
3. **Haz clic en ▶ Confirmar** — la IA generará opciones para cada marcador
4. **Selecciona** la opción que más te guste para cada marcador (checkmark verde)
5. **Haz clic en ✦ Integrar Historia** — la IA une todo en una narración fluida
6. **N↑ Notion** — sube tu historia final a tu base de datos de Notion

## Configuración (⚙ Config)

| Campo | Descripción |
|-------|-------------|
| Anthropic API Key | Tu key `sk-ant-...` de console.anthropic.com |
| Modelo | Sonnet 4 recomendado; Haiku para velocidad |
| Opciones por marcador | Cuántas sugerencias generar (3–5) |
| Notion Token | `secret_...` de notion.so/my-integrations |
| Notion Database ID | ID de tu base de datos (con o sin guiones) |
| Tags | Etiquetas para la página de Notion |

## Sintaxis de marcadores

```
[[descripción breve de lo que necesitas]]
```

Puedes usar lenguaje natural dentro de los corchetes:
- `[[un bosque medieval cerca de Milán]]`
- `[[material de tela usado en el siglo XIV]]`
- `[[nombre femenino italiano de la época]]`
- `[[una frase motivacional del héroe]]`

## Requisitos

- Node.js 18+
- Cuenta Anthropic (claude.ai o API)
- Base de datos Notion (opcional)
