import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTest, rescalePoints, sumPoints } from "../src/lib/validate.js";
import { escapeLatex, renderTex } from "../src/lib/latex.js";
import { buildDocx } from "../src/lib/docx.js";
import { makeZip, crc32 } from "../src/lib/zip.js";
import { generateDraft, validateDraftParams } from "../src/lib/draft.js";

const sample = () =>
  normalizeTest({
    title: "Prova & $x^2$ #1",
    subject: "matematica",
    totalPoints: 10,
    items: [
      { type: "multiple_choice", text: "Quanto fa 2+2?", points: 3, choices: ["3", "4"], correct: 1, solution: "4" },
      { type: "true_false", text: "Vero?", points: 2, answer: true },
      { type: "exercise", text: "Risolvi \\input{/etc/passwd} $x=1$", points: 5 },
    ],
  });

test("normalizeTest accetta e rifiuta", () => {
  assert.equal(sample().ok, true);
  assert.equal(normalizeTest({ title: "" }).ok, false);
  assert.equal(normalizeTest(null).ok, false);
  assert.equal(normalizeTest({ title: "x", year: 9 }).ok, false);
});

test("rescalePoints porta la somma al totale", () => {
  const { test: t } = sample();
  t.items.forEach((i) => (i.points = 1));
  rescalePoints(t.items, 10);
  assert.equal(Math.round(sumPoints(t) * 100) / 100, 10);
});

test("escapeLatex neutralizza i caratteri speciali", () => {
  const out = escapeLatex("a & b # c % d _ e");
  assert.match(out, /\\&/);
  assert.match(out, /\\#/);
  assert.match(out, /\\%/);
});

test("renderTex non lascia comandi pericolosi", () => {
  const tex = renderTex(sample().test, "verifica");
  assert.match(tex, /\\documentclass/);
  assert.doesNotMatch(tex, /\\input\{/);
  assert.match(tex, /textbackslash\{\}input/); // resta solo testo inerte
  assert.match(renderTex(sample().test, "soluzioni"), /\\begin\{document\}/);
});

test("zip: firma, voci e CRC", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = makeZip([{ name: "a.txt", data: "ciao" }, { name: "b.bin", data: new Uint8Array([1, 2, 3]) }]);
  assert.equal(String.fromCharCode(zip[0], zip[1]), "PK");
  assert.ok(Buffer.from(zip).includes("a.txt"));
});

test("docx è uno ZIP con document.xml ben formato", () => {
  const bytes = buildDocx(sample().test, "soluzioni");
  const text = Buffer.from(bytes).toString("latin1");
  assert.equal(text.slice(0, 2), "PK");
  for (const name of ["[Content_Types].xml", "word/document.xml"]) assert.ok(text.includes(name), name);
});

test("bozza: deterministica con seme, valida e con punteggio corretto", () => {
  const v = validateDraftParams({ subject: "matematica", track: "scientifico", year: 3, topics: "derivate, integrali", items: 7, seed: 42 });
  assert.equal(v.ok, true);
  const a = generateDraft(v.params);
  const b = generateDraft(v.params);
  const strip = (t) => ({ ...t, items: t.items.map(({ id, ...rest }) => rest) });
  assert.deepEqual(strip(a.test), strip(b.test));
  assert.equal(a.test.items.length, 7);
  assert.equal(Math.round(sumPoints(a.test) * 100) / 100, 100);
});

test("bozza: parametri non validi", () => {
  assert.equal(validateDraftParams({ subject: "latino", track: "x", topics: "" }).ok, false);
  assert.equal(validateDraftParams({ subject: "fisica", track: "classico", year: 2, topics: "moto", items: 99 }).ok, false);
});
