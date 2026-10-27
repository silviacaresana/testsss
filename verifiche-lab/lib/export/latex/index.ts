import fs from "node:fs";
import path from "node:path";
import { Eta } from "eta";
import { buildExportModel, type BuildOptions, type ExportModel } from "../model";
import type { TestForExport } from "../types";

const latexDir = path.join(process.cwd(), "lib", "export", "latex");

const eta = new Eta({
  views: latexDir,
  cache: false,
  autoEscape: false,
  autoTrim: false,
});

let preambleCache: string | null = null;
let macrosCache: string | null = null;

function readStatic(name: string): string {
  return fs.readFileSync(path.join(latexDir, name), "utf8");
}

function staticParts(): { preamble: string; macros: string } {
  if (!preambleCache) preambleCache = readStatic("preamble.tex");
  if (!macrosCache) macrosCache = readStatic("macros.tex");
  return { preamble: preambleCache, macros: macrosCache };
}

function renderItemBlock(model: ExportModel, itemId: string): string {
  const section = model.sections.find((s) => s.items.some((item) => item.id === itemId));
  const item = section?.items.find((candidate) => candidate.id === itemId) ?? model.items.find((i) => i.id === itemId);
  if (!item) return "";
  const templateName = `item-${item.type.replace(/_/g, "-")}.tex.tmpl`;
  const known = new Set([
    "item-multiple-choice.tex.tmpl",
    "item-true-false.tex.tmpl",
    "item-short-answer.tex.tmpl",
    "item-open-answer.tex.tmpl",
    "item-exercise.tex.tmpl",
    "item-problem.tex.tmpl",
    "item-graph.tex.tmpl",
    "item-lab-data.tex.tmpl",
    "item-proof.tex.tmpl",
  ]);
  return eta.render(known.has(templateName) ? templateName : "item-open-answer.tex.tmpl", item);
}

function renderSolutionBlock(model: ExportModel, itemId: string): string {
  const item = model.items.find((candidate) => candidate.id === itemId);
  if (!item) return "";
  try {
    return eta.render("solution-item.tex.tmpl", item);
  } catch (error) {
    console.error("solution render failed", Object.keys(item), error);
    throw error;
  }
}

export interface RenderedDocuments {
  verificationTex: string;
  solutionsTex: string;
  rubricTex: string;
  filenames: { verification: string; solutions: string; rubric: string };
  model: ExportModel;
}

export function renderDocuments(test: TestForExport, options: BuildOptions = {}): RenderedDocuments {
  const model = buildExportModel(test, options);
  const { preamble, macros } = staticParts();
  const header = eta.render("header.tex.tmpl", model);

  const mainSections = model.sections.map((section) => ({
    ...section,
    blocks: section.items.map((item) => renderItemBlock(model, item.id)),
  }));

  const verificationTex = eta.render("main.tex.tmpl", { ...model, preamble, macros, header, sections: mainSections });

  const solutionSections = model.sections.map((section) => ({
    ...section,
    solutions: section.items.map((item) => renderSolutionBlock(model, item.id)),
  }));
  const solutionsTex = eta.render("solutions.tex.tmpl", {
    ...model,
    preamble,
    macros,
    header,
    sections: solutionSections,
  });

  const rubricTex = eta.render("rubric.tex.tmpl", { ...model, preamble, macros, header });

  return {
    verificationTex,
    solutionsTex,
    rubricTex,
    filenames: {
      verification: `${model.baseName}.tex`,
      solutions: `${model.baseName.replace(/^verifica-/, "soluzioni-")}.tex`,
      rubric: `${model.baseName.replace(/^verifica-/, "griglia-")}.tex`,
    },
    model,
  };
}
