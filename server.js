// Prospect — servidor local de produção (sem dependências). Uso: npm start
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi, startAutomation } from "./server/api.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const HOST = "127.0.0.1";
const BASE_PORT = Number(process.env.PORT) || 5175;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const api = createApi({ resultsDir: path.join(ROOT, "resultados") });

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  let file = path.resolve(DIST, relative);
  if (!file.startsWith(DIST + path.sep) && file !== DIST) {
    res.writeHead(403).end("Acesso negado.");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    // Página única: qualquer rota cai no index.html
    file = path.join(DIST, "index.html");
    try {
      res.writeHead(200, { "Content-Type": MIME[".html"] }).end(await readFile(file));
    } catch {
      res.writeHead(500).end("Rode “npm run build” antes de “node server.js”.");
    }
  }
}

function listen(port, attempt = 0) {
  const server = http.createServer((req, res) => {
    // Só aceita o próprio endereço local
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) {
      res.writeHead(403).end("Origem não permitida.");
      return;
    }
    api(req, res, () => serveStatic(req, res));
  });
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 10) listen(port + 1, attempt + 1);
    else throw err;
  });
  server.listen(port, HOST, () => console.log(`\n  Prospect rodando em http://localhost:${port}\n  Para encerrar: Ctrl+C\n`));
}

listen(BASE_PORT);
startAutomation().catch((e) => console.error("Automação:", e.message));
