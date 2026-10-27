import JSZip from "jszip";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { getTestForUser } from "@/lib/tests/repository";
import { renderDocuments } from "@/lib/export/latex";
import { compileLatex, engineVersionLabel, latexAvailability } from "@/lib/export/compile";
import { getInstituteSettings } from "@/lib/ai/config";
import { buildFileName } from "@/lib/export/model";
import type { TestForExport } from "@/lib/export/types";
import { buildPreviewHtml } from "@/lib/export/html";
import { audit } from "@/lib/api";
import { toJson } from "@/lib/utils";

export type ExportFormat = "tex" | "pdf" | "zip" | "json";
export type ExportKind = "verifica" | "soluzioni" | "griglia" | "pacchetto";

export class ExportError extends Error {
  log: string;
  engine: string;
  constructor(message: string, log: string, engine: string) {
    super(message);
    this.name = "ExportError";
    this.log = log;
    this.engine = engine;
  }
}

export interface SingleExport {
  buffer: Buffer;
  filename: string;
  contentType: string;
  log?: string;
}

async function testForExport(testId: string, user: SessionUser): Promise<TestForExport> {
  await getTestForUser(testId, user);
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      items: { include: { topic: true }, orderBy: { order: "asc" } },
      sections: { orderBy: { order: "asc" } },
      rubric: true,
      gradeScale: true,
      author: { select: { name: true } },
      curriculum: true,
    },
  });
  if (!test) throw new ExportError("Verifica non trovata.", "", engineVersionLabel());
  return test;
}

function docsFor(test: TestForExport, instituteName: string, logoFile: string | null) {
  return renderDocuments(test, { instituteName, logoFile });
}

function readmeText(baseName: string, engine: string): string {
  return [
    "VerificheLab — pacchetto di esportazione",
    "=======================================",
    "",
    `Verifica: ${baseName}`,
    `Motore LaTeX configurato: ${engine}`,
    "",
    "Contenuto del pacchetto:",
    "  - verifica (.tex + .pdf): consegna da stampare per gli studenti",
    "  - soluzioni (.tex + .pdf): soluzioni svolte con criteri di punteggio",
    "  - griglia (.tex + .pdf): indicatori, descrittori, conversione in decimi",
    "  - verifica.json: dati strutturati per modifiche e rigenerazioni",
    "  - README.txt: questo file",
    "",
    "Compilazione con Tectonic:",
    `  tectonic "${baseName}.tex"`,
    `  tectonic "soluzioni-${baseName.replace(/^verifica-/, "")}.tex"`,
    `  tectonic "griglia-${baseName.replace(/^verifica-/, "")}.tex"`,
    "",
    "Compilazione con pdflatex (due passate):",
    `  pdflatex -interaction=nonstopmode "${baseName}.tex"`,
    `  pdflatex -interaction=nonstopmode "${baseName}.tex"`,
    "",
    "I file .tex sono autonomi: non richiedono immagini esterne né file di supporto.",
    "Se un PDF manca nel pacchetto, apri il relativo .tex e controlla il log di compilazione.",
    "",
    "Nessun dato di studenti è contenuto in questo pacchetto.",
  ].join("\n");
}

function filenameFor(baseName: string, kind: ExportKind): string {
  if (kind === "verifica") return baseName;
  if (kind === "soluzioni") return baseName.replace(/^verifica-/, "soluzioni-");
  return baseName.replace(/^verifica-/, "griglia-");
}

export async function exportSingle(
  testId: string,
  user: SessionUser,
  format: ExportFormat,
  kind: Exclude<ExportKind, "pacchetto">,
): Promise<SingleExport> {
  const test = await testForExport(testId, user);
  const { name: instituteName, logoPath } = await getInstituteSettings();
  const docs = docsFor(test, instituteName, logoPath || null);
  const base = filenameFor(docs.model.baseName, kind);

  if (format === "tex") {
    const source =
      kind === "verifica" ? docs.verificationTex : kind === "soluzioni" ? docs.solutionsTex : docs.rubricTex;
    await prisma.export.create({
      data: {
        testId,
        format: "tex",
        kind,
        filePath: `${base}.tex`,
        engine: engineVersionLabel(),
        status: "ok",
        logExcerpt: "",
      },
    });
    await audit(user.id, "export", "Test", testId, { format, kind });
    return { buffer: Buffer.from(source, "utf8"), filename: `${base}.tex`, contentType: "application/x-tex; charset=utf-8" };
  }

  if (format === "json") {
    const json = {
      formato: "VerificheLab/1",
      generatoIl: new Date().toISOString(),
      verifica: {
        id: test.id,
        title: test.title,
        track: test.track,
        year: test.year,
        subject: test.subject,
        classLabel: test.classLabel,
        examDate: test.examDate,
        durationMin: test.durationMin,
        totalPoints: test.totalPoints,
        difficultyTarget: test.difficultyTarget,
        calculatorAllowed: test.calculatorAllowed,
        formulaSheet: test.formulaSheet,
        status: test.status,
        versionLabel: test.versionLabel,
        sections: test.sections,
        items: test.items.map((item) => ({
          ...item,
          options: JSON.parse(item.options || "[]"),
          objectives: JSON.parse(item.objectives || "[]"),
          solutionSteps: JSON.parse(item.solutionSteps || "[]"),
          gradingCriteria: JSON.parse(item.gradingCriteria || "[]"),
          commonErrors: JSON.parse(item.commonErrors || "[]"),
          hints: JSON.parse(item.hints || "[]"),
          figureSpec: item.figureSpec ? JSON.parse(item.figureSpec) : null,
        })),
        rubric: test.rubric
          ? {
              indicators: JSON.parse(test.rubric.indicatorsJson || "[]"),
              levels: JSON.parse(test.rubric.levelsJson || "[]"),
              itemMapping: JSON.parse(test.rubric.itemMappingJson || "{}"),
            }
          : null,
      },
    };
    await prisma.export.create({
      data: {
        testId,
        format: "json",
        kind,
        filePath: `${docs.model.baseName}.json`,
        engine: "",
        status: "ok",
      },
    });
    await audit(user.id, "export", "Test", testId, { format: "json" });
    return {
      buffer: Buffer.from(JSON.stringify(json, null, 2), "utf8"),
      filename: `${docs.model.baseName}.json`,
      contentType: "application/json; charset=utf-8",
    };
  }

  const source =
    kind === "verifica" ? docs.verificationTex : kind === "soluzioni" ? docs.solutionsTex : docs.rubricTex;
  const compile = await compileLatex(source, {});
  await prisma.export.create({
    data: {
      testId,
      format: "pdf",
      kind,
      filePath: compile.ok ? `${base}.pdf` : "",
      engine: compile.engine,
      engineVersion: "",
      status: compile.ok ? "ok" : "errore",
      logExcerpt: compile.log.slice(-3000),
    },
  });
  await audit(user.id, "export", "Test", testId, { format: "pdf", kind, ok: compile.ok });
  if (!compile.ok || !compile.pdf) {
    throw new ExportError(
      "La compilazione LaTeX non è riuscita. Il sorgente .tex è comunque disponibile: scaricalo e controlla il log.",
      compile.log,
      compile.engine,
    );
  }
  return {
    buffer: compile.pdf,
    filename: `${base}.pdf`,
    contentType: "application/pdf",
    log: compile.log,
  };
}

export async function exportZip(testId: string, user: SessionUser): Promise<SingleExport> {
  const test = await testForExport(testId, user);
  const { name: instituteName, logoPath } = await getInstituteSettings();
  const docs = docsFor(test, instituteName, logoPath || null);
  const base = docs.model.baseName;
  const zip = new JSZip();
  const logs: string[] = [];
  let failureLogs = 0;
  const extraFiles = logoPath ? [{ name: "logo.png", path: logoPath }] : [];

  zip.file(`${base}.tex`, docs.verificationTex);
  zip.file(`${filenameFor(base, "soluzioni")}.tex`, docs.solutionsTex);
  zip.file(`${filenameFor(base, "griglia")}.tex`, docs.rubricTex);

  const compilations = [
    { kind: "verifica" as const, source: docs.verificationTex, name: base },
    { kind: "soluzioni" as const, source: docs.solutionsTex, name: filenameFor(base, "soluzioni") },
    { kind: "griglia" as const, source: docs.rubricTex, name: filenameFor(base, "griglia") },
  ];
  for (const entry of compilations) {
    const compile = await compileLatex(entry.source, { extraFiles });
    logs.push(`${entry.name}: ${compile.ok ? "PDF generato" : `compilazione fallita (${compile.engine})`}`);
    if (compile.ok && compile.pdf) {
      zip.file(`${entry.name}.pdf`, compile.pdf);
    } else {
      failureLogs += 1;
      zip.file(`${entry.name}.log.txt`, compile.log);
    }
    await prisma.export.create({
      data: {
        testId,
        format: "pdf",
        kind: entry.kind,
        filePath: compile.ok ? `${entry.name}.pdf` : "",
        engine: compile.engine,
        status: compile.ok ? "ok" : "errore",
        logExcerpt: compile.log.slice(-3000),
      },
    });
  }

  const json = await exportJsonPayload(test);
  zip.file(`${base}.json`, JSON.stringify(json, null, 2));
  zip.file(
    "README.txt",
    `${readmeText(base, engineVersionLabel())}\n\nEsito compilazione:\n${logs.map((line) => `  - ${line}`).join("\n")}\n`,
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const files = 8 + failureLogs;
  await prisma.export.create({
    data: {
      testId,
      format: "zip",
      kind: "pacchetto",
      filePath: `${base}.zip`,
      engine: engineVersionLabel(),
      status: hadCompilationFailures(logs) ? "errore" : "ok",
      logExcerpt: logs.join("\n").slice(-3000),
    },
  });
  await audit(user.id, "export", "Test", testId, { format: "zip", files, failures: failureLogs });
  return { buffer, filename: `${base}.zip`, contentType: "application/zip" };
}

function hadCompilationFailures(logs: string[]): boolean {
  return logs.some((line) => line.includes("fallita"));
}

function exportJsonPayload(test: TestForExport) {
  return {
    formato: "VerificheLab/1",
    generatoIl: new Date().toISOString(),
    verifica: {
      id: test.id,
      title: test.title,
      track: test.track,
      year: test.year,
      subject: test.subject,
      classLabel: test.classLabel,
      examDate: test.examDate,
      durationMin: test.durationMin,
      totalPoints: test.totalPoints,
      difficultyTarget: test.difficultyTarget,
      calculatorAllowed: test.calculatorAllowed,
      formulaSheet: test.formulaSheet,
      trigTables: test.trigTables,
      noDerivatives: test.noDerivatives,
      onlyDefinitions: test.onlyDefinitions,
      simplifiedLanguage: test.simplifiedLanguage,
      answerSpace: test.answerSpace,
      status: test.status,
      versionLabel: test.versionLabel,
      author: test.author.name,
      curriculum: test.curriculum?.title ?? null,
      sections: test.sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        order: section.order,
      })),
      items: test.items.map((item) => ({
        id: item.id,
        sectionId: item.sectionId,
        type: item.type,
        prompt: item.prompt,
        options: JSON.parse(item.options || "[]"),
        correctOption: item.correctOption,
        points: item.points,
        difficulty: item.difficulty,
        estimatedMin: item.estimatedMin,
        topicCode: item.topic?.code ?? null,
        objectives: JSON.parse(item.objectives || "[]"),
        solutionSteps: JSON.parse(item.solutionSteps || "[]"),
        gradingCriteria: JSON.parse(item.gradingCriteria || "[]"),
        commonErrors: JSON.parse(item.commonErrors || "[]"),
        hints: JSON.parse(item.hints || "[]"),
        answerSpace: item.answerSpace,
        figureSpec: item.figureSpec ? JSON.parse(item.figureSpec) : null,
        source: item.source,
        isLocked: item.isLocked,
        order: item.order,
      })),
      rubric: test.rubric
        ? {
            indicators: JSON.parse(test.rubric.indicatorsJson || "[]"),
            levels: JSON.parse(test.rubric.levelsJson || "[]"),
            itemMapping: JSON.parse(test.rubric.itemMappingJson || "{}"),
          }
        : null,
      gradeScale: test.gradeScale
        ? {
            name: test.gradeScale.name,
            totalPoints: test.gradeScale.totalPoints,
            sufficiencyThreshold: test.gradeScale.sufficiencyThreshold,
            mapping: JSON.parse(test.gradeScale.mappingJson || "{}"),
          }
        : null,
    },
  };
}

const previewCache = new Map<string, { at: number; pdf: Buffer | null; html: string; log: string }>();

function previewKey(test: TestForExport, kind: string): string {
  const itemStamp = test.items.reduce((max, item) => Math.max(max, item.updatedAt.getTime()), 0);
  return `${test.id}:${test.updatedAt.getTime()}:${itemStamp}:${kind}`;
}

export interface PreviewResult {
  pdf: Buffer | null;
  html: string;
  log: string;
  engineAvailable: boolean;
}

export async function previewTest(
  testId: string,
  user: SessionUser,
  kind: "verifica" | "soluzioni" | "griglia",
): Promise<PreviewResult> {
  const test = await testForExport(testId, user);
  const key = previewKey(test, kind);
  const cached = previewCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return { pdf: cached.pdf, html: cached.html, log: cached.log, engineAvailable: true };
  }
  const { name: instituteName, logoPath } = await getInstituteSettings();
  const docs = docsFor(test, instituteName, logoPath || null);
  const source =
    kind === "verifica" ? docs.verificationTex : kind === "soluzioni" ? docs.solutionsTex : docs.rubricTex;
  const availability = await latexAvailability();
  const compile = availability.ok ? await compileLatex(source, { timeoutMs: 45_000 }) : null;
  const html = buildPreviewHtml(test, docs.model, kind, compile?.log ?? availability.message, Boolean(compile?.ok));
  const result = {
    at: Date.now(),
    pdf: compile?.ok ? compile.pdf : null,
    html,
    log: compile?.log ?? availability.message,
  };
  previewCache.set(key, result);
  if (previewCache.size > 24) {
    const oldest = [...previewCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) previewCache.delete(oldest[0]);
  }
  return { pdf: result.pdf, html: result.html, log: result.log, engineAvailable: availability.ok };
}

export async function previewFallbackHtml(
  testId: string,
  user: SessionUser,
  kind: "verifica" | "soluzioni" | "griglia",
  log: string,
): Promise<string> {
  const test = await testForExport(testId, user);
  const { name: instituteName, logoPath } = await getInstituteSettings();
  const docs = docsFor(test, instituteName, logoPath || null);
  return buildPreviewHtml(test, docs.model, kind, log, false);
}

export function exportFileName(test: TestForExport): string {
  return buildFileName(test).baseName;
}

export function exportJsonString(test: TestForExport): string {
  return toJson(exportJsonPayload(test));
}
