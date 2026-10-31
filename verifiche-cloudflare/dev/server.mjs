// Server di sviluppo: esegue lo STESSO codice del Worker (src/worker.js) su Node, con un
// database SQLite locale al posto di D1. Ascolta solo su 127.0.0.1.
//
//   npm run dev            → http://127.0.0.1:8787
//
// Di default il sito è aperto (ALLOW_PUBLIC=true) perché in locale non c'è Cloudflare Access.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { createD1 } from "./d1-node.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function staticAssets(publicDir) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = path.resolve(publicDir, "." + pathname);
      if (file !== publicDir && !file.startsWith(publicDir + path.sep)) return new Response("Non trovato", { status: 404 });
      try {
        const data = await fs.readFile(file);
        return new Response(data, {
          headers: { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" },
        });
      } catch {
        return new Response("Non trovato", { status: 404 });
      }
    },
  };
}

async function toRequest(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else if (value != null) headers.set(name, value);
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    init.body = Buffer.concat(chunks);
  }
  return new Request(`http://${req.headers.host ?? "127.0.0.1"}${req.url}`, init);
}

/** @returns {Promise<{server: import("node:http").Server, url: string, close: () => Promise<void>}>} */
export function startDevServer({
  port = 8787,
  host = "127.0.0.1",
  dbPath = path.join(here, "local.db"),
  publicDir = path.join(root, "public"),
  vars = {},
} = {}) {
  const db = createD1(dbPath, path.join(root, "migrations"));
  const env = { DB: db, ASSETS: staticAssets(path.resolve(publicDir)), ALLOW_PUBLIC: "true", ...vars };

  const server = http.createServer(async (req, res) => {
    try {
      const response = await worker.fetch(await toRequest(req), env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Errore interno del server di sviluppo.");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const { port: actual } = server.address();
      resolve({
        server,
        url: `http://${host}:${actual}`,
        close: () => new Promise((done) => server.close(() => { db.close(); done(); })),
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const vars = {};
  if (process.env.INSTITUTE_NAME) vars.INSTITUTE_NAME = process.env.INSTITUTE_NAME;
  if (process.env.ALLOW_PUBLIC) vars.ALLOW_PUBLIC = process.env.ALLOW_PUBLIC;
  const { url } = await startDevServer({ port, vars });
  console.log(`Verifiche in locale: ${url}`);
  console.log("Il database è dev/local.db. Ctrl+C per fermare.");
}
