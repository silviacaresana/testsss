/**
 * Genera gli esempi versionati in examples/.
 *
 * Richiede il database dimostrativo (`npm run db:seed`) e un motore LaTeX.
 * Per ogni verifica dimostrativa scrive:
 *   verifica .tex + .pdf
 *   soluzioni .tex + .pdf
 *   griglia .tex + .pdf
 *   dati .json
 * In più crea il pacchetto ZIP completo per la verifica scientifica.
 *
 * Il comando fallisce se una compilazione non riesce: gli esempi nel repository
 * devono essere sempre scaricabili e stampabili.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";
import { exportSingle, exportZip, ExportError } from "../lib/export/service";
import { getInstituteSettings } from "../lib/ai/config";
import type { SessionUser } from "../lib/auth/session";

const ROOT = process.cwd();

interface DemoTest {
  id: string;
  title: string;
  track: string;
  items: { points: number; estimatedMin: number }[];
}

function folderFor(track: string): string {
  return path.join(ROOT, "examples", `1-${track}`);
}

async function cleanExamples() {
  const dir = path.join(ROOT, "examples");
  await fs.mkdir(dir, { recursive: true });
  for (const entry of await fs.readdir(dir)) {
    if (entry.startsWith("_smoke")) await fs.rm(path.join(dir, entry), { force: true });
  }
  for (const track of ["classico", "scientifico"]) {
    await fs.rm(folderFor(track), { recursive: true, force: true });
  }
}

async function writeSingle(
  test: DemoTest,
  user: SessionUser,
  kind: "verifica" | "soluzioni" | "griglia",
  folder: string,
): Promise<string[]> {
  const written: string[] = [];
  const tex = await exportSingle(test.id, user, "tex", kind);
  await fs.writeFile(path.join(folder, tex.filename), tex.buffer);
  written.push(tex.filename);

  try {
    const pdf = await exportSingle(test.id, user, "pdf", kind);
    await fs.writeFile(path.join(folder, pdf.filename), pdf.buffer);
    written.push(pdf.filename);
  } catch (error) {
    if (error instanceof ExportError) {
      const logName = `${tex.filename.replace(/\.tex$/, "")}.log.txt`;
      await fs.writeFile(path.join(folder, logName), `${error.message}\n\n${error.log}\n`, "utf8");
      written.push(logName);
      throw new Error(`${test.title} — ${kind}: ${error.message}`);
    }
    throw error;
  }
  return written;
}

function buildReadme(input: {
  institute: string;
  generatedAt: string;
  tests: { test: DemoTest; files: string[]; zip?: string }[];
}): string {
  const lines = [
    "# Esempi di esportazione",
    "",
    `Questi file sono stati generati da VerificheLab il ${input.generatedAt} con il database dimostrativo`,
    `e l'istituto «${input.institute}». Sono versionati di proposito: servono come prova che i sorgenti`,
    "`.tex` compilano da soli e che i PDF contengono i punteggi, le sezioni e il piè di pagina «Pag. X di Y».",
    "",
    "Ogni cartella contiene:",
    "",
    "- `verifica-*.tex` e `.pdf`: consegna per gli studenti;",
    "- `soluzioni-*.tex` e `.pdf`: soluzioni svolte e criteri;",
    "- `griglia-*.tex` e `.pdf`: indicatori, descrittori, mappatura e conversione in decimi;",
    "- `verifica-*.json`: dati strutturati della verifica.",
    "",
    "Per ricompilare a mano (senza dipendenze esterne oltre al motore LaTeX):",
    "",
    "```bash",
    'tectonic "verifica-matematica-1-scientifico-....tex"',
    "```",
    "",
    "oppure, con due passate:",
    "",
    "```bash",
    'pdflatex -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"',
    'pdflatex -interaction=nonstopmode "verifica-matematica-1-scientifico-....tex"',
    "```",
    "",
    "Per rigenerare tutto: `npm run db:seed && npm run examples`.",
    "",
    "## Contenuto",
    "",
  ];
  for (const entry of input.tests) {
    lines.push(
      `### ${entry.test.title}`,
      "",
      `Indirizzo: ${entry.test.track}; quesiti: ${entry.test.items.length}; ` +
        `punti: ${entry.test.items.reduce((sum, item) => sum + item.points, 0)}; ` +
        `tempo: ${entry.test.items.reduce((sum, item) => sum + item.estimatedMin, 0)} min.`,
      "",
      ...entry.files.map((file) => `- \`${file}\``),
      ...(entry.zip ? [`- \`${entry.zip}\` (pacchetto completo)`] : []),
      "",
    );
  }
  lines.push(
    "I contenuti dei programmi sono segnaposto didattici dichiarati, non programmi ministeriali.",
    "Nessun dato di studentesse o studenti è presente negli esempi.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const teacher = await prisma.user.findFirst({
    where: { email: "docente@verifichelab.local" },
  });
  if (!teacher) throw new Error("Database dimostrativo assente: esegui prima `npm run db:seed`.");
  const user: SessionUser = {
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
    role: teacher.role,
    subjects: teacher.subjects,
    tracks: teacher.tracks,
  };

  const rows = await prisma.test.findMany({
    where: { title: { startsWith: "Verifica dimostrativa" } },
    include: { items: { select: { points: true, estimatedMin: true } } },
    orderBy: { title: "asc" },
  });
  if (rows.length === 0) throw new Error("Nessuna verifica dimostrativa trovata: esegui `npm run db:seed`.");

  await cleanExamples();
  const institute = await getInstituteSettings();
  const summary: { test: DemoTest; files: string[]; zip?: string }[] = [];

  for (const row of rows) {
    const test: DemoTest = {
      id: row.id,
      title: row.title,
      track: row.track,
      items: row.items,
    };
    const points = test.items.reduce((sum, item) => sum + item.points, 0);
    const minutes = test.items.reduce((sum, item) => sum + item.estimatedMin, 0);
    if (Math.abs(points - 100) > 0.001 || Math.abs(minutes - 60) > 0.001) {
      throw new Error(`${test.title}: attesi 100 pt / 60 min, trovati ${points} pt / ${minutes} min.`);
    }

    const folder = folderFor(test.track);
    await fs.mkdir(folder, { recursive: true });
    const files: string[] = [];
    for (const kind of ["verifica", "soluzioni", "griglia"] as const) {
      files.push(...(await writeSingle(test, user, kind, folder)));
    }
    const json = await exportSingle(test.id, user, "json", "verifica");
    await fs.writeFile(path.join(folder, json.filename), json.buffer);
    files.push(json.filename);

    let zipName: string | undefined;
    if (test.track === "scientifico") {
      const zip = await exportZip(test.id, user);
      zipName = zip.filename;
      await fs.writeFile(path.join(folder, zipName), zip.buffer);
    }

    summary.push({ test, files, zip: zipName });
    console.log(`  ${test.title}: ${files.length} file${zipName ? " + ZIP" : ""}`);
  }

  const readme = buildReadme({
    institute: institute.name,
    generatedAt: new Date().toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Rome",
    }),
    tests: summary,
  });
  await fs.writeFile(path.join(ROOT, "examples", "README.md"), readme, "utf8");
  console.log(`Esempi scritti in ${path.join(ROOT, "examples")}`);
}

main()
  .catch((error) => {
    console.error("Generazione esempi fallita:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
