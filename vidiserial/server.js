/**
 * RSVP Stories — local static server
 * Sirve index.html y assets desde la carpeta del proyecto.
 * Cero dependencias (solo módulos nativos de Node).
 *
 * Uso:
 *   node server.js          → arranca en http://localhost:3748
 *   PORT=4000 node server.js → arranca en :4000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = parseInt(process.env.PORT || "3748", 10);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".mov":  "video/quicktime",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8",
};

function send(res, code, headers, body){
  res.writeHead(code, headers);
  res.end(body);
}

function safeJoin(root, target){
  // prevent directory traversal
  const resolved = path.resolve(root, "." + target);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer((req, res)=>{
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname || "/");
  if (pathname === "/") pathname = "/index.html";

  const filePath = safeJoin(ROOT, pathname);
  if (!filePath){
    return send(res, 403, {"Content-Type":"text/plain"}, "Forbidden");
  }

  fs.stat(filePath, (err, stat)=>{
    if (err || !stat.isFile()){
      return send(res, 404, {"Content-Type":"text/plain"}, "Not found: " + pathname);
    }
    const ext = path.extname(filePath).toLowerCase();
    const ctype = MIME[ext] || "application/octet-stream";
    const headers = {
      "Content-Type": ctype,
      "Content-Length": stat.size,
      // disable cache so edits during dev show immediately
      "Cache-Control": "no-store",
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, ()=>{
  console.log("");
  console.log("  ╭──────────────────────────────────────╮");
  console.log("  │  RSVP Stories                        │");
  console.log("  │  → http://localhost:" + PORT + "             │");
  console.log("  ╰──────────────────────────────────────╯");
  console.log("");
  console.log("  Ctrl+C para detener");
  console.log("");
});
