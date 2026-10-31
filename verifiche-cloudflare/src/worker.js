// Punto d'ingresso del Worker: protezione (Cloudflare Access), API JSON, esportazioni e file statici.
//
// Tutto passa da qui (anche i file di public/), perché in wrangler.jsonc è impostato
// `run_worker_first`: la verifica di Access vale per ogni pagina e per ogni API.

import { guard } from "./lib/access.js";
import { HttpError, json, errorResponse, readJson, download, withSecurityHeaders } from "./lib/http.js";
import { normalizeTest, rescalePoints } from "./lib/validate.js";
import { listTests, getTest, createTest, updateTest, deleteTest } from "./lib/store.js";
import { renderTex } from "./lib/latex.js";
import { buildDocx } from "./lib/docx.js";
import { makeZip } from "./lib/zip.js";
import { slugify } from "./lib/text.js";
import { generateDraft, validateDraftParams, topicSuggestions } from "./lib/draft.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;
const MAX_JSON_BYTES = 400_000;
const SAFE_METHODS = new Set(["GET", "HEAD"]);

const TEX_TYPE = "application/x-tex; charset=utf-8";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const EXPORT_FORMATS = ["tex", "tex-soluzioni", "docx", "docx-soluzioni", "json", "zip"];

function baseName(test) {
  const slug = slugify(test.title);
  return test.date ? `${slug}-${test.date}` : slug;
}

function readme(test, base) {
  return [
    `Verifica: ${test.title}`,
    "",
    `${base}.tex, ${base}-soluzioni.tex`,
    "  Sorgenti LaTeX. Si compilano con pdflatex (due volte) oppure si caricano su Overleaf.",
    "  Serve il pacchetto italiano di LaTeX (babel italian).",
    `${base}.docx, ${base}-soluzioni.docx`,
    "  Per Word o LibreOffice. Le formule diventano testo con simboli Unicode.",
    `${base}.json`,
    "  Copia dei dati: si può reimportare nell'app con «Importa JSON».",
    "",
  ].join("\n");
}

/** @returns {{body: string|Uint8Array, filename: string, type: string}} */
export function exportFile(record, format) {
  const test = record.test;
  const base = baseName(test);
  const json = () => JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), test }, null, 2);
  switch (format) {
    case "tex":
      return { body: renderTex(test, "verifica"), filename: `${base}.tex`, type: TEX_TYPE };
    case "tex-soluzioni":
      return { body: renderTex(test, "soluzioni"), filename: `${base}-soluzioni.tex`, type: TEX_TYPE };
    case "docx":
      return { body: buildDocx(test, "verifica"), filename: `${base}.docx`, type: DOCX_TYPE };
    case "docx-soluzioni":
      return { body: buildDocx(test, "soluzioni"), filename: `${base}-soluzioni.docx`, type: DOCX_TYPE };
    case "json":
      return { body: json(), filename: `${base}.json`, type: "application/json; charset=utf-8" };
    case "zip":
      return {
        body: makeZip([
          { name: `${base}.tex`, data: renderTex(test, "verifica") },
          { name: `${base}-soluzioni.tex`, data: renderTex(test, "soluzioni") },
          { name: `${base}.docx`, data: buildDocx(test, "verifica") },
          { name: `${base}-soluzioni.docx`, data: buildDocx(test, "soluzioni") },
          { name: `${base}.json`, data: json() },
          { name: "LEGGIMI.txt", data: readme(test, base) },
        ]),
        filename: `${base}.zip`,
        type: "application/zip",
      };
    default:
      throw new HttpError(400, `Formato non valido. Scegli tra: ${EXPORT_FORMATS.join(", ")}.`);
  }
}

function sameOrigin(request, url) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // richieste non da browser: nessun cookie da proteggere
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

function invalid(errors) {
  return errorResponse(422, "Dati non validi.", { errors });
}

function methodNotAllowed(...allowed) {
  return json({ error: "Metodo non consentito." }, 405, { allow: allowed.join(", ") });
}

async function readTest(request, key = "test") {
  const body = await readJson(request, MAX_JSON_BYTES);
  const parsed = normalizeTest(body?.[key]);
  return { body, parsed };
}

async function routeTests(request, env, identity, rest, url) {
  const method = request.method.toUpperCase();
  const db = env.DB;
  if (!db) throw new HttpError(503, "Database non collegato: controlla il binding «DB» in wrangler.jsonc.");

  if (rest.length === 0) {
    if (method === "GET") return json({ tests: await listTests(db) });
    if (method === "POST") {
      const { parsed } = await readTest(request);
      if (!parsed.ok) return invalid(parsed.errors);
      return json({ record: await createTest(db, parsed.test, identity?.email) }, 201);
    }
    return methodNotAllowed("GET", "POST");
  }

  const id = rest[0];
  if (!ID_PATTERN.test(id)) throw new HttpError(404, "Verifica non trovata.");
  const action = rest[1];

  if (!action) {
    if (method === "GET") {
      const record = await getTest(db, id);
      if (!record) throw new HttpError(404, "Verifica non trovata.");
      return json({ record });
    }
    if (method === "PUT") {
      const { body, parsed } = await readTest(request);
      const revision = body?.revision;
      if (!Number.isInteger(revision) || revision < 1) throw new HttpError(400, "Manca la revisione letta dal browser.");
      if (!parsed.ok) return invalid(parsed.errors);
      const outcome = await updateTest(db, id, revision, parsed.test);
      if (outcome.status === "missing") throw new HttpError(404, "Verifica non trovata.");
      if (outcome.status === "conflict") {
        return json(
          { error: "La verifica è stata modificata nel frattempo da un'altra persona o da un'altra scheda.", record: outcome.record },
          409,
        );
      }
      return json({ record: outcome.record });
    }
    if (method === "DELETE") {
      if (!(await deleteTest(db, id))) throw new HttpError(404, "Verifica non trovata.");
      return json({ ok: true });
    }
    return methodNotAllowed("GET", "PUT", "DELETE");
  }

  if (rest.length > 2) throw new HttpError(404, "Risorsa non trovata.");

  if (action === "duplicate") {
    if (method !== "POST") return methodNotAllowed("POST");
    const record = await getTest(db, id);
    if (!record) throw new HttpError(404, "Verifica non trovata.");
    const copy = { ...record.test, title: `Copia di ${record.test.title}`.slice(0, 200) };
    const parsed = normalizeTest(copy);
    if (!parsed.ok) return invalid(parsed.errors);
    return json({ record: await createTest(db, parsed.test, identity?.email) }, 201);
  }

  if (action === "export") {
    if (!SAFE_METHODS.has(method)) return methodNotAllowed("GET");
    const record = await getTest(db, id);
    if (!record) throw new HttpError(404, "Verifica non trovata.");
    const file = exportFile(record, url.searchParams.get("format") ?? "");
    return download(file.body, file.filename, file.type);
  }

  throw new HttpError(404, "Risorsa non trovata.");
}

async function route(request, env, identity) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/api" && !path.startsWith("/api/")) {
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Non trovato", { status: 404 });
  }

  const method = request.method.toUpperCase();
  if (!SAFE_METHODS.has(method) && !sameOrigin(request, url)) {
    return errorResponse(403, "Richiesta proveniente da un altro sito: non consentita.");
  }

  const [section, ...rest] = path.split("/").slice(2);
  switch (section) {
    case "me":
      if (method !== "GET") return methodNotAllowed("GET");
      return json({
        email: identity?.email ?? null,
        institute: String(env.INSTITUTE_NAME ?? ""),
        publicMode: String(env.ALLOW_PUBLIC ?? "").toLowerCase() === "true",
      });
    case "topics":
      if (method !== "GET") return methodNotAllowed("GET");
      return json({ topics: topicSuggestions() });
    case "draft": {
      if (method !== "POST") return methodNotAllowed("POST");
      const params = validateDraftParams(await readJson(request, MAX_JSON_BYTES));
      if (!params.ok) return invalid(params.errors);
      return json(generateDraft(params.params));
    }
    case "rescale": {
      if (method !== "POST") return methodNotAllowed("POST");
      const { parsed } = await readTest(request);
      if (!parsed.ok) return invalid(parsed.errors);
      rescalePoints(parsed.test.items, parsed.test.totalPoints);
      return json({ test: parsed.test });
    }
    case "tests":
      return routeTests(request, env, identity, rest, url);
    default:
      throw new HttpError(404, "Risorsa non trovata.");
  }
}

export default {
  async fetch(request, env) {
    const isApi = new URL(request.url).pathname.startsWith("/api");
    try {
      const gate = await guard(request, env);
      if (!gate.ok) return withSecurityHeaders(gate.response, { api: isApi });
      const response = await route(request, env, gate.identity);
      return withSecurityHeaders(response, { api: isApi });
    } catch (error) {
      if (error instanceof HttpError) {
        return withSecurityHeaders(errorResponse(error.status, error.message, error.extra), { api: true });
      }
      console.error("Errore non gestito:", error);
      return withSecurityHeaders(errorResponse(500, "Errore interno. Riprova tra poco."), { api: true });
    }
  },
};
