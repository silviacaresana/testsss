/**
 * Controllo di qualità dei sorgenti LaTeX e dei PDF in examples/.
 *
 * 1. ogni .tex viene compilato da solo in una cartella temporanea;
 * 2. il PDF deve contenere "Pag. 1 di N" su ogni pagina e il totale corretto;
 * 3. il log non deve contenere errori LaTeX bloccanti;
 * 4. il pacchetto ZIP deve contenere i sei file attesi + JSON + README;
 * 5. il testo deve riportare il punteggio di 100 punti.
 *
 * Uso: npm run latex:check
 */

import fs from "node:fs/promises";
import path from "node:path";
import { compileLatex } from "../lib/export/compile";
import { extractPdfText } from "../lib/pdf/text";
import JSZip from "jszip";

const ROOT = process.cwd();
const EXAMPLES = path.join(ROOT, "examples");
const PAGE_RE = /Pag\.\s*(\d+)\s*di\s*(\d+)/g;

interface Check {
  file: string;
  ok: boolean;
  problems: string[];
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function blockingLog(log: string): string[] {
  const problems: string[] = [];
  for (const line of log.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("!")) problems.push(`errore LaTeX: ${trimmed}`);
    if (/LaTeX Error:/i.test(trimmed)) problems.push(`errore LaTeX: ${trimmed}`);
    if (/Emergency stop/i.test(trimmed)) problems.push(`arresto di emergenza: ${trimmed}`);
  }
  return problems;
}

async function checkPdf(buffer: Buffer, label: string): Promise<string[]> {
  const problems: string[] = [];
  let parsed;
  try {
    parsed = await extractPdfText(buffer);
  } catch (error) {
    return [`impossibile estrarre il testo da ${label}: ${error instanceof Error ? error.message : String(error)}`];
  }
  const text = parsed.text.replace(/\s+/g, " ").trim();
  const matches = [...text.matchAll(PAGE_RE)];
  if (matches.length === 0) {
    problems.push("manca il piè di pagina «Pag. X di Y».");
  } else {
    const pages = new Set(matches.map((match) => Number(match[1])));
    const totals = new Set(matches.map((match) => Number(match[2])));
    if (!pages.has(1)) problems.push("manca «Pag. 1 di N».");
    if (pages.size !== parsed.pages) {
      problems.push(`numerazione presente su ${pages.size} pagine su ${parsed.pages}.`);
    }
    if (totals.size !== 1 || [...totals][0] !== parsed.pages) {
      problems.push(`totale pagine incoerente: ${[...totals].join(", ")} (PDF: ${parsed.pages}).`);
    }
    if (/Pag\.\s*\d+\s*di\s*\?\?/.test(text)) problems.push("riferimento a LastPage non risolto (??).");
  }
  if (!/100/.test(text)) problems.push("il punteggio di 100 punti non compare nel testo.");
  if (!/(Punteggio|punteggio)/.test(text)) problems.push("manca l'etichetta del punteggio.");
  return problems;
}

async function checkZip(file: string): Promise<string[]> {
  const problems: string[] = [];
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const has = (fragment: string) => names.some((name) => name.includes(fragment));
  for (const fragment of ["verifica-", "soluzioni-", "griglia-", "README.txt"]) {
    if (!has(fragment)) problems.push(`ZIP privo di ${fragment}*`);
  }
  const tex = names.filter((name) => name.endsWith(".tex"));
  const pdf = names.filter((name) => name.endsWith(".pdf"));
  const json = names.filter((name) => name.endsWith(".json"));
  if (tex.length !== 3) problems.push(`attesi 3 .tex, trovati ${tex.length}.`);
  if (pdf.length !== 3) problems.push(`attesi 3 .pdf, trovati ${pdf.length}.`);
  if (json.length !== 1) problems.push(`atteso 1 .json, trovato ${json.length}.`);
  if (!names.includes("README.txt")) problems.push("manca README.txt.");
  if (names.length !== 8) problems.push(`attesi 8 file nel pacchetto, trovati ${names.length}.`);
  return problems;
}

async function main() {
  const all = await walk(EXAMPLES);
  const texFiles = all.filter((file) => file.endsWith(".tex"));
  const storedPdf = all.filter((file) => file.endsWith(".pdf"));
  const zipFiles = all.filter((file) => file.endsWith(".zip"));
  if (texFiles.length === 0) throw new Error("Nessun .tex in examples/: esegui prima `npm run examples`.");

  const checks: Check[] = [];

  for (const file of texFiles) {
    const relative = path.relative(ROOT, file);
    const problems: string[] = [];
    const source = await fs.readFile(file, "utf8");
    const result = await compileLatex(source, { timeoutMs: 90_000 });
    if (!result.ok || !result.pdf) {
      problems.push(`compilazione fallita (${result.engine}): ${result.log.split("\n").slice(-4).join(" ")}`);
    } else {
      problems.push(...blockingLog(result.log));
      problems.push(...(await checkPdf(result.pdf, relative)));
    }
    checks.push({ file: relative, ok: problems.length === 0, problems });
    console.log(`  ${problems.length === 0 ? "OK  " : "FAIL"} ${relative}`);
  }

  for (const file of storedPdf) {
    const relative = path.relative(ROOT, file);
    const problems = await checkPdf(await fs.readFile(file), relative);
    checks.push({ file: relative, ok: problems.length === 0, problems });
    console.log(`  ${problems.length === 0 ? "OK  " : "FAIL"} ${relative}`);
  }

  for (const file of zipFiles) {
    const relative = path.relative(ROOT, file);
    const problems = await checkZip(file);
    checks.push({ file: relative, ok: problems.length === 0, problems });
    console.log(`  ${problems.length === 0 ? "OK  " : "FAIL"} ${relative}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error("");
    console.error("Controlli falliti:");
    for (const check of failed) {
      console.error(`- ${check.file}`);
      for (const problem of check.problems) console.error(`    ${problem}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("");
  console.log(`Tutti i controlli superati: ${checks.length} file verificati.`);
}

main().catch((error) => {
  console.error("Controllo LaTeX fallito:", error);
  process.exitCode = 1;
});
