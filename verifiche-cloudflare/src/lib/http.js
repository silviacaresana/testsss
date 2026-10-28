export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(status, message, extra = {}) {
  return json({ error: message, ...extra }, status);
}

export async function readJson(request, maxBytes) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Il contenuto deve essere JSON.");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Contenuto troppo grande.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON non valido.");
  }
}

export function download(body, filename, contentType) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    },
  });
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

/** Copia la risposta (quelle degli asset sono immutabili) e aggiunge le intestazioni di sicurezza. */
export function withSecurityHeaders(response, { api = false } = {}) {
  const out = new Response(response.body, response);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "DENY");
  out.headers.set("Referrer-Policy", "no-referrer");
  out.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  out.headers.set("Content-Security-Policy", CSP);
  out.headers.set("Cache-Control", api ? "no-store" : "no-cache");
  return out;
}

export function htmlPage(status, title, message) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const body = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#1f2937}h1{font-size:1.3rem}</style></head><body><h1>${esc(title)}</h1><p>${esc(message)}</p></body></html>`;
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}
