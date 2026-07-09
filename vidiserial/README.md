# RSVP Stories

Lector vertical RSVP en formato 9:16 para crear videos tipo story con fondos de imagen/video, slideshow, música, título, portada PNG y exportación a MP4 1080×1920. Si el navegador no soporta WebCodecs/H.264, la app cae automáticamente a WebM.

## Estructura

```
rsvp-stories/
├── index.html       # toda la app (HTML + CSS + JS en un solo archivo)
├── server.js        # servidor estático local (Node, sin dependencias)
├── package.json
└── README.md
```

## Cómo arrancar (VS Code)

1. Abre la carpeta del proyecto en VS Code: **File → Open Folder…**
2. Abre la terminal integrada: **Ctrl+`** (o **View → Terminal**)
3. Asegúrate de tener Node 16+ instalado:
   ```bash
   node --version
   ```
4. Inicia el servidor:
   ```bash
   npm start
   ```
   o directo:
   ```bash
   node server.js
   ```
5. Abre en el navegador: **http://localhost:3748**

Para usar otro puerto:
```bash
PORT=4000 node server.js
```

## Cómo usar

### Texto
- Pega tu historia en el textarea (panel izquierdo). El conteo de palabras y duración estimada se actualizan al instante.

### Fondos
- Modo **1 medio 9:16**: una sola imagen o video que cubre toda la pantalla.
- Modo **2 medios 1:1**: dos fondos cuadrados apilados (superior + inferior).
- Modo **slideshow**: lista reordenable de fotos o videos con duración individual por slide.
- Soporta:
  - Imágenes: PNG, JPG, GIF, WebP
  - Videos: MP4, WebM, MOV (lo que tu navegador soporte nativamente)
- Puedes hacer **click** en el slot o **drag & drop** un archivo encima.

### Música
- Puedes cargar un archivo de audio de fondo: MP3, OGG, WAV, M4A, AAC o FLAC.
- El panel permite ajustar volumen y activar/desactivar loop.
- La música se incluye en la exportación cuando el navegador permite capturar o codificar el audio.

### Título y subtítulo
- Puedes agregar un título y subtítulo sobre el video.
- Controla la duración del overlay y su posición vertical.
- Si la duración está en `0`, el título permanece visible durante todo el video.

### Lectura RSVP
- **Velocidad**: 120–700 wpm
- **Tipografía**: Proxima Nova, Fraunces, Playfair, DM Serif, Montserrat, Sora, Bricolage Grotesque, Inter Tight
- **Pivote**: la letra ORP de cada palabra resaltada en color (configurable). 7 presets + color picker custom.
- **Pausa en puntuación**: multiplica la duración cuando una palabra termina en `. , ; : ! ? … — –`
- **Franja central**: altura y color configurables.

### Atajos de teclado
| Tecla | Acción |
|---|---|
| `Espacio` | Play / pausa |
| `←` / `→` | Palabra anterior / siguiente |
| `↑` / `↓` | Subir / bajar velocidad ±20 wpm |
| `R` | Reiniciar al inicio |

### Exportar
- **PNG cover**: portada estática 1080×1920 (la primera palabra sobre el fondo).
- **Exportar MP4**: renderiza el video completo a 1080×1920 @ 30fps usando WebCodecs + `mp4-muxer`.
- **Fallback WebM**: si WebCodecs, H.264 o `mp4-muxer` no están disponibles, exporta WebM con `MediaRecorder`.
- El botón de exportación se deshabilita durante el proceso.

## Notas técnicas

- **Sin dependencias.** El servidor usa solo módulos nativos de Node (`http`, `fs`, `path`, `url`).
- **Frontend en un solo archivo.** Todo el HTML, CSS y JS de la app vive en `index.html`.
- **Llamadas externas del navegador**:
  - Google Fonts para fuentes de UI y opciones RSVP.
  - cdnfonts para Proxima Nova.
  - jsDelivr para `mp4-muxer`, necesario para exportar MP4.
  Si trabajas offline, las fuentes harán fallback a fuentes del sistema y el export puede caer a WebM si `mp4-muxer` no carga.
- **Memoria**: los archivos cargados se mantienen en RAM como `Object URL`s (`blob:`). Se liberan al reemplazar o quitar slots, y al hacer Reset.
- **Export MP4**: usa un canvas 1080×1920, dibuja cada frame a 30fps, codifica con `VideoEncoder` y empaqueta con `mp4-muxer`. Si hay música, intenta codificar AAC con `AudioEncoder`.
- **Export WebM fallback**: usa `canvas.captureStream()` + `MediaRecorder`, con codecs preferidos VP9 → VP8 → default WebM.

## Resolución de problemas

**"No se pudo cargar el video"** → Abre la consola del navegador (F12). El loader registra el código de error. Los más comunes:
- Código 4 (formato): el codec interno del MP4 no es compatible — re-encode con `ffmpeg -c:v libx264 -pix_fmt yuv420p input.mov output.mp4`.
- Código 3 (decodificación): archivo corrupto o demasiado pesado para el navegador.

**Al pulsar Exportar MP4 se genera WebM** → Tu navegador no soporta WebCodecs/H.264, no cargó `mp4-muxer`, o falló la detección del codec. Usa Chrome/Edge reciente para mejor soporte.

**El video del fondo se queda congelado en el WebM exportado** → Asegúrate de que el video se está reproduciendo en el preview antes de pulsar exportar. El fallback WebM graba frames vivos del navegador.

**El export con videos de fondo va lento** → Cuando hay videos de fondo, el export MP4 busca frames concretos con `currentTime`, lo que puede ser más pesado según el codec y tamaño del archivo.

**La música no aparece en el export** → Puede depender del soporte del navegador para `AudioEncoder`, `captureStream()` o el formato del audio. Prueba con MP3/WAV y Chrome/Edge reciente.

**localhost:3748 ya está ocupado** → Usa otro puerto: `PORT=4000 node server.js`

## Personalización rápida

Todos los tokens de diseño viven en `:root` dentro de `index.html`:

```css
:root{
  --accent:    #ff5b2e;     /* color principal de UI */
  --bg:        #0a0a0b;     /* fondo de la app */
  /* ... */
}
```
