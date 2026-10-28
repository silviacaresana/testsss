import { buildExportModel, type BuildOptions, type ExportModel } from "../model";
import type { TestForExport } from "../types";
import { renderTemplate, staticFile } from "./templates";

function staticParts(): { preamble: string; macros: string } {
  return { preamble: staticFile("preamble.tex"), macros: staticFile("macros.tex") };
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
  return renderTemplate(known.has(templateName) ? templateName : "item-open-answer.tex.tmpl", item);
}

function renderSolutionBlock(model: ExportModel, itemId: string): string {
  const item = model.items.find((candidate) => candidate.id === itemId);
  if (!item) return "";
  try {
    return renderTemplate("solution-item.tex.tmpl", item);
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
  const header = renderTemplate("header.tex.tmpl", model);

  const mainSections = model.sections.map((section) => ({
    ...section,
    blocks: section.items.map((item) => renderItemBlock(model, item.id)),
  }));

  const verificationTex = renderTemplate("main.tex.tmpl", { ...model, preamble, macros, header, sections: mainSections });

  const solutionSections = model.sections.map((section) => ({
    ...section,
    solutions: section.items.map((item) => renderSolutionBlock(model, item.id)),
  }));
  const solutionsTex = renderTemplate("solutions.tex.tmpl", {
    ...model,
    preamble,
    macros,
    header,
    sections: solutionSections,
  });

  const rubricTex = renderTemplate("rubric.tex.tmpl", { ...model, preamble, macros, header });

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
