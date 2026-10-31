import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyAccessJwt, guard, resetAccessCache } from "../src/lib/access.js";

const TEAM = "scuola.cloudflareaccess.com";
const AUD = "aud-123";
const NOW = 1_800_000_000_000;
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const fetchImpl = async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

function token(over = {}, key = privateKey) {
  const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = b64({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 600, email: "doc@scuola.it", ...over });
  return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url")}`;
}
const verify = (t) => verifyAccessJwt(t, { team: TEAM, aud: AUD, fetchImpl, nowMs: NOW });

test.beforeEach(() => resetAccessCache());

test("token valido", async () => assert.equal((await verify(token())).email, "doc@scuola.it"));
test("token scaduto", async () => await assert.rejects(verify(token({ exp: NOW / 1000 - 3600 }))));
test("aud errato", async () => await assert.rejects(verify(token({ aud: ["altro"] }))));
test("iss errato", async () => await assert.rejects(verify(token({ iss: "https://evil.example" }))));
test("firma di un'altra chiave", async () => await assert.rejects(verify(token({}, other.privateKey))));
test("alg none rifiutato", async () => {
  const t = `${b64({ alg: "none", kid: "k1" })}.${b64({ iss: `https://${TEAM}`, aud: [AUD], exp: NOW / 1000 + 600 })}.`;
  await assert.rejects(verify(t));
});

test("guard: fail-closed senza configurazione", async () => {
  const r = await guard(new Request("https://x.test/"), {});
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 503);
});
test("guard: senza token 401, con token ok, public ok", async () => {
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  assert.equal((await guard(new Request("https://x.test/api/me"), env, { fetchImpl, nowMs: NOW })).response.status, 401);
  const ok = await guard(new Request("https://x.test/", { headers: { "Cf-Access-Jwt-Assertion": token() } }), env, { fetchImpl, nowMs: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.identity.email, "doc@scuola.it");
  assert.equal((await guard(new Request("https://x.test/"), { ALLOW_PUBLIC: "true" })).ok, true);
});
