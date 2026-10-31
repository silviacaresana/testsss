import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { createD1 } from "../dev/d1-node.mjs";

const db = createD1(":memory:", new URL("../migrations", import.meta.url).pathname);
const env = { DB: db, ALLOW_PUBLIC: "true", ASSETS: { fetch: async () => new Response("<html>ok</html>", { headers: { "content-type": "text/html" } }) } };
const call = (path, { method = "GET", body, headers = {} } = {}) =>
  worker.fetch(
    new Request(`https://app.test${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );

const base = { title: "Verifica API", subject: "fisica", totalPoints: 10, items: [{ type: "open", text: "Perché?", points: 10 }] };
let id, revision;

test("crea, legge, elenca", async () => {
  const created = await call("/api/tests", { method: "POST", body: { test: base } });
  assert.equal(created.status, 201);
  ({ id, revision } = (await created.json()).record);
  assert.equal(revision, 1);
  assert.equal((await (await call("/api/tests")).json()).tests.length, 1);
  assert.equal((await call(`/api/tests/${id}`)).status, 200);
});

test("dati non validi → 422 con elenco errori", async () => {
  const r = await call("/api/tests", { method: "POST", body: { test: { title: "" } } });
  assert.equal(r.status, 422);
  assert.ok((await r.json()).errors.length > 0);
});

test("aggiornamento con revisione, conflitto 409", async () => {
  const ok = await call(`/api/tests/${id}`, { method: "PUT", body: { revision, test: { ...base, title: "Nuovo" } } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).record.revision, 2);
  const stale = await call(`/api/tests/${id}`, { method: "PUT", body: { revision, test: base } });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).record.title, "Nuovo");
  assert.equal((await call(`/api/tests/${id}`, { method: "PUT", body: { test: base } })).status, 400);
});

test("esportazioni", async () => {
  for (const [format, type] of [["tex", "x-tex"], ["tex-soluzioni", "x-tex"], ["docx", "wordprocessingml"], ["json", "json"], ["zip", "zip"]]) {
    const r = await call(`/api/tests/${id}/export?format=${format}`);
    assert.equal(r.status, 200, format);
    assert.match(r.headers.get("content-type"), new RegExp(type));
    assert.match(r.headers.get("content-disposition"), /attachment/);
    assert.ok((await r.arrayBuffer()).byteLength > 100);
  }
  assert.equal((await call(`/api/tests/${id}/export?format=pdf`)).status, 400);
});

test("duplica ed elimina", async () => {
  const dup = await call(`/api/tests/${id}/duplicate`, { method: "POST", body: {} });
  assert.equal(dup.status, 201);
  const copy = (await dup.json()).record;
  assert.match(copy.title, /^Copia di /);
  assert.equal((await call(`/api/tests/${copy.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await call(`/api/tests/${copy.id}`)).status, 404);
});

test("sicurezza: id strani, origine diversa, content-type, intestazioni", async () => {
  assert.equal((await call("/api/tests/..%2f..%2fetc")).status, 404);
  assert.equal((await call("/api/tests/abc")).status, 404);
  const cross = await call("/api/tests", { method: "POST", body: { test: base }, headers: { origin: "https://evil.example" } });
  assert.equal(cross.status, 403);
  const form = await worker.fetch(new Request("https://app.test/api/tests", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ test: base }) }), env);
  assert.ok(form.status >= 400 && form.status < 500);
  const r = await call("/api/me");
  assert.ok(r.headers.get("content-security-policy"));
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("pagine statiche e protezione", async () => {
  assert.equal((await call("/")).status, 200);
  const closed = await worker.fetch(new Request("https://app.test/"), { DB: db, ASSETS: env.ASSETS });
  assert.equal(closed.status, 503);
  const closedApi = await worker.fetch(new Request("https://app.test/api/tests"), { DB: db });
  assert.equal(closedApi.status, 503);
});
