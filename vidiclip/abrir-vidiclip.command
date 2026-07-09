#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

HTTP_PORT=8765
API_PORT=3747

# Levantar server.js si no está corriendo
if ! lsof -Pi :$API_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Iniciando servidor API en puerto $API_PORT..."
    node "$DIR/server.js" &
    sleep 1
fi

# Levantar servidor HTTP si no está corriendo
if lsof -Pi :$HTTP_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Servidor HTTP ya corriendo en puerto $HTTP_PORT"
    open "http://localhost:$HTTP_PORT/vidiclip-stories.html"
    exit 0
fi

# Buscar Python
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    osascript -e 'display alert "Error" message "No se encontró Python. Instala Python 3 desde python.org"'
    exit 1
fi

echo "Iniciando Vidiclip Stories en http://localhost:$HTTP_PORT ..."

(sleep 1 && open "http://localhost:$HTTP_PORT/vidiclip-stories.html") &

$PYTHON -m http.server $HTTP_PORT
