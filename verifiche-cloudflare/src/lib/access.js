// Protezione tramite Cloudflare Access.
//
// L'app non ha account. Davanti ad essa Cloudflare Access chiede l'accesso (es. email +
// codice) e inoltra a ogni richiesta un token firmato (JWT) nell'intestazione
// `Cf-Access-Jwt-Assertion`. Qui il token viene VERIFICATO (firma, scadenza, emittente,
// destinatario): se Access non è configurato o la richiesta non lo ha attraversato,
// il sito non si apre ("fail-closed"). Solo con ALLOW_PUBLIC=true resta aperto a tutti.

import { htmlPage, errorResponse } from "./http.js";

const JWKS_TTL_MS = 60 * 60 * 1000;
const LEEWAY_SEC = 30;
const cache = { team: "", keys: null, fetchedAt: 0 };

function b64urlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJson(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function loadKeys(team, fetchImpl, force) {
  const fresh = cache.keys && cache.team === team && Date.now() - cache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return cache.keys;
  const response = await fetchImpl(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Impossibile leggere le chiavi di Access (${response.status}).`);
  const data = await response.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  cache.team = team;
  cache.keys = keys;
  cache.fetchedAt = Date.now();
  return keys;
}

/** Verifica un JWT di Access e restituisce il payload; lancia un errore se non valido. */
export async function verifyAccessJwt(token, { team, aud, fetchImpl = fetch, nowMs = Date.now() }) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("Token malformato.");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJson(b64urlToBytes(headerPart));
  if (header.alg !== "RS256") throw new Error("Algoritmo non supportato.");

  let keys = await loadKeys(team, fetchImpl, false);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keys = await loadKeys(team, fetchImpl, true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) throw new Error("Chiave di firma sconosciuta.");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw new Error("Firma non valida.");

  const payload = parseJson(b64urlToBytes(payloadPart));
  const now = nowMs / 1000;
  if (typeof payload.exp !== "number" || payload.exp + LEEWAY_SEC < now) throw new Error("Token scaduto.");
  if (typeof payload.nbf === "number" && payload.nbf - LEEWAY_SEC > now) throw new Error("Token non ancora valido.");
  if (payload.iss !== `https://${team}`) throw new Error("Emittente non corretto.");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(aud)) throw new Error("Destinatario non corretto.");
  return payload;
}

function cookieValue(header, name) {
  for (const part of (header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function denied(request, status, message) {
  const isApi = new URL(request.url).pathname.startsWith("/api/");
  return isApi ? errorResponse(status, message) : htmlPage(status, status === 503 ? "Sito non ancora configurato" : "Accesso negato", message);
}

export function normalizeTeamDomain(value) {
  return String(value ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Decide se la richiesta può procedere.
 * @returns {Promise<{ok: true, identity: {email: string|null}|null} | {ok: false, response: Response}>}
 */
export async function guard(request, env, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (String(env.ALLOW_PUBLIC ?? "").toLowerCase() === "true") return { ok: true, identity: null };

  const team = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const aud = String(env.ACCESS_AUD ?? "").trim();
  if (!team || !aud) {
    return {
      ok: false,
      response: denied(
        request,
        503,
        "Cloudflare Access non è ancora configurato (ACCESS_TEAM_DOMAIN e ACCESS_AUD). Segui la sezione «Proteggere il sito» del README.",
      ),
    };
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") || cookieValue(request.headers.get("cookie"), "CF_Authorization");
  if (!token) {
    return { ok: false, response: denied(request, 401, "Accesso richiesto: la richiesta non è passata da Cloudflare Access.") };
  }
  try {
    const payload = await verifyAccessJwt(token, { team, aud, fetchImpl, nowMs });
    return { ok: true, identity: { email: payload.email || payload.common_name || null } };
  } catch {
    return { ok: false, response: denied(request, 401, "Accesso non valido o scaduto. Riapri il sito e accedi di nuovo.") };
  }
}

export function resetAccessCache() {
  cache.team = "";
  cache.keys = null;
  cache.fetchedAt = 0;
}
