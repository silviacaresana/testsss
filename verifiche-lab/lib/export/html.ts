import katex from "katex";
import type { ExportModel, RenderItem } from "./model";
import type { TestForExport } from "./types";
import { formatDateIT } from "@/lib/utils";
import { itemTypeLabel, subjectLabel, trackLabel } from "@/lib/constants";

/**
 * Anteprima HTML accessibile, usata quando il motore LaTeX non è disponibile
 * (o mentre il PDF viene compilato). Le formule passano da KaTeX con
 * `trust: false`: nessun comando HTML/LaTeX arbitrario viene eseguito.
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMath(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return `<code class="math-fallback">${escapeHtml(expression)}</code>`;
  }
}

/** Testo con matematica inline `$...$` / display `$$...$$`, tutto il resto escapato. */
export function richText(input: string): string {
  if (!input) return "";
  const source = input.replace(/\r\n/g, "\n");
  let out = "";
  let index = 0;
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  for (const match of source.matchAll(pattern)) {
    const at = match.index ?? 0;
    out += escapeHtml(source.slice(index, at)).replace(/\n/g, "<br>");
    if (match[1] !== undefined) {
      out += `<span class="math-display">${renderMath(match[1], true)}</span>`;
    } else {
      out += renderMath(match[2] ?? "", false);
    }
    index = at + match[0].length;
  }
  out += escapeHtml(source.slice(index)).replace(/\n/g, "<br>");
  return out;
}

function answerSpace(item: RenderItem): string {
  if (item.answerLines <= 0) return "";
  if (item.type === "graph") {
    return `<div class="grid-space" role="img" aria-label="Griglia per il grafico"></div>`;
  }
  return `<div class="answer-lines">${Array.from({ length: item.answerLines })
    .map(() => '<span class="line"></span>')
    .join("")}</div>`;
}

function optionsHtml(item: RenderItem, test: TestForExport): string {
  const raw = test.items.find((candidate) => candidate.id === item.id)?.options;
  let options: string[] = [];
  try {
    options = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    options = [];
  }
  if (options.length === 0) return "";
  const letters = ["A", "B", "C", "D", "E", "F"];
  return `<ol class="options" type="A">${options
    .map((option, index) => `<li><span class="option-letter">${letters[index] ?? index + 1}.</span> ${richText(option)}</li>`)
    .join("")}</ol>`;
}

function figureHtml(item: RenderItem, test: TestForExport): string {
  const raw = test.items.find((candidate) => candidate.id === item.id)?.figureSpec;
  if (!raw) return "";
  try {
    const spec = JSON.parse(raw) as Record<string, unknown>;
    if (spec.kind === "data_table" && Array.isArray(spec.head) && Array.isArray(spec.rows)) {
      const head = spec.head as unknown[];
      const rows = spec.rows as unknown[][];
      return `<table class="data-table"><thead><tr>${head
        .map((cell) => `<th>${richText(String(cell))}</th>`)
        .join("")}</tr></thead><tbody>${rows
        .map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${richText(String(cell))}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
    }
    if (spec.kind === "cartesian") {
      return '<div class="grid-space cartesian" role="img" aria-label="Piano cartesiano"></div>';
    }
    if (spec.kind === "triangle") {
      return '<svg class="figure" viewBox="0 0 320 220" role="img" aria-label="Triangolo"><polygon points="30,190 290,190 120,30" fill="none" stroke="#1f2937" stroke-width="2"/><text x="150" y="212" font-size="14">b</text><text x="95" y="105" font-size="14">c</text><text x="300" y="135" font-size="14">a</text></svg>';
    }
  } catch {
    return "";
  }
  return "";
}

function itemHtml(item: RenderItem, test: TestForExport, withSolution: boolean): string {
  const db = test.items.find((candidate) => candidate.id === item.id);
  const readList = (raw: string | undefined): string[] => {
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };
  const steps = readList(db?.solutionSteps);
  const criteria = readList(db?.gradingCriteria);
  const errors = readList(db?.commonErrors);
  const solution = withSolution
    ? `<div class="solution">
        ${steps.length > 0 ? `<h4>Svolgimento</h4><ol>${steps.map((step) => `<li>${richText(step)}</li>`).join("")}</ol>` : ""}
        ${criteria.length > 0 ? `<h4>Criteri di punteggio</h4><ul>${criteria.map((criterion) => `<li>${richText(criterion)}</li>`).join("")}</ul>` : ""}
        ${errors.length > 0 ? `<div class="errors"><strong>Errori comuni:</strong> ${errors.map((error) => richText(error)).join("; ")}</div>` : ""}
      </div>`
    : "";
  return `<article class="item" data-item-id="${escapeHtml(item.id)}">
    <div class="item-head">
      <span class="item-number">${item.number}.</span>
      <span class="item-points">[${item.pointsTex} pt]</span>
      <span class="item-type">${escapeHtml(itemTypeLabel(item.type))}</span>
    </div>
    <div class="item-prompt">${richText(db?.prompt ?? "")}</div>
    ${figureHtml(item, test)}
    ${optionsHtml(item, test)}
    ${withSolution ? "" : answerSpace(item)}
    ${solution}
  </article>`;
}

function rubricHtml(model: ExportModel): string {
  return `<section class="page-break">
    <h2>Griglia di valutazione</h2>
    <p>La griglia è uno strumento di correzione: gli indicatori sono calcolati sui punti dei quesiti mappati.</p>
    <table class="rubric-table">
      <thead><tr><th>Indicatore</th>${model.levels
        .map((level) => `<th>Livello ${level.level}<br><small>${level.labelTex}</small></th>`)
        .join("")}</tr></thead>
      <tbody>${model.indicatorRows
        .map(
          (row) =>
            `<tr><th>${escapeHtml(row.indicatorTex)}</th><td>${escapeHtml(row.level1Tex)}</td><td>${escapeHtml(
              row.level2Tex,
            )}</td><td>${escapeHtml(row.level3Tex)}</td><td>${escapeHtml(row.level4Tex)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <h3>Punteggi per indicatore</h3>
    <table class="simple-table"><thead><tr><th>Indicatore</th><th>Punti</th><th>Percentuale</th></tr></thead>
      <tbody>${model.indicatorTotals
        .map(
          (row) =>
            `<tr><td>${escapeHtml(row.indicatorTex)}</td><td>${escapeHtml(row.pointsTex)}</td><td>${escapeHtml(
              row.percentTex,
            )}%</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <h3>Mappatura dei quesiti</h3>
    <table class="simple-table"><thead><tr><th>N.</th><th>Tipo</th><th>Punti</th><th>Indicatori</th><th>Criteri</th></tr></thead>
      <tbody>${model.itemRows
        .map(
          (row) =>
            `<tr><td>${row.number}</td><td>${escapeHtml(row.typeTex)}</td><td>${escapeHtml(row.pointsTex)}</td><td>${escapeHtml(
              row.indicatorsTex,
            )}</td><td>${escapeHtml(row.criteriaTex)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <h3>Conversione punteggio / voto</h3>
    <table class="simple-table grade-table"><thead><tr><th>Punti</th><th>Percentuale</th><th>Voto</th></tr></thead>
      <tbody>${model.gradeRows
        .map(
          (row) =>
            `<tr class="${row.isThreshold ? "threshold" : ""}"><td>${escapeHtml(row.scoreTex)}</td><td>${escapeHtml(
              row.percent,
            )}%</td><td>${escapeHtml(row.gradeTex)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
  </section>`;
}

export function buildPreviewHtml(
  test: TestForExport,
  model: ExportModel,
  kind: "verifica" | "soluzioni" | "griglia",
  log: string,
  compiled: boolean,
): string {
  const title =
    kind === "verifica"
      ? test.title
      : kind === "soluzioni"
        ? `Soluzioni — ${test.title}`
        : `Griglia — ${test.title}`;
  const withSolution = kind === "soluzioni";
  const sections = model.sections
    .map((section) => {
      const rawSection = test.sections.find((candidate) => candidate.id === section.id);
      return `<section class="section">
        <h2>${escapeHtml(rawSection?.title ?? section.titleTex)}</h2>
        ${
          (rawSection?.description ?? section.descriptionTex)
            ? `<p class="section-description">${escapeHtml(rawSection?.description ?? section.descriptionTex)}</p>`
            : ""
        }
        ${section.items.map((item) => itemHtml(item, test, withSolution)).join("")}
      </section>`;
    })
    .join("");

  const header = `<header class="test-header">
    <div class="institute">${escapeHtml(model.instituteTex)}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta-grid">
      <span><strong>Indirizzo:</strong> ${escapeHtml(trackLabel(test.track))}</span>
      <span><strong>Classe:</strong> ${escapeHtml(test.classLabel || String(test.year))}</span>
      <span><strong>Materia:</strong> ${escapeHtml(subjectLabel(test.subject))}</span>
      <span><strong>Data:</strong> ${escapeHtml(formatDateIT(test.examDate ?? test.createdAt))}</span>
      <span><strong>Durata:</strong> ${test.durationMin} minuti</span>
      <span><strong>Punteggio:</strong> ${escapeHtml(model.pointsTex)} pt</span>
      <span><strong>Soglia:</strong> ${escapeHtml(model.thresholdTex)}% (${escapeHtml(model.thresholdPointsTex)} pt)</span>
      <span><strong>Versione:</strong> ${escapeHtml(test.versionLabel || "A")}</span>
    </div>
    <div class="student-line">Nome e cognome: ________________________________________&nbsp;&nbsp;&nbsp; Classe: __________&nbsp;&nbsp;&nbsp; Voto: __________</div>
    <p class="instructions">${escapeHtml(model.instructions)}</p>
  </header>`;

  const banner = compiled
    ? ""
    : `<div class="fallback-banner"><strong>Anteprima HTML (KaTeX).</strong> Il PDF LaTeX non è disponibile in questo momento. Il sorgente <code>.tex</code> resta scaricabile e compilabile. <details><summary>Log compilazione</summary><pre>${escapeHtml(
        log || "Nessun log disponibile.",
      )}</pre></details></div>`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/katex/katex.min.css">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef1f5; color: #111827; font-family: Georgia, Cambria, "Times New Roman", serif; font-size: 15px; line-height: 1.5; }
  .page { max-width: 900px; margin: 0 auto; background: #fff; padding: 42px 54px 60px; box-shadow: 0 8px 30px rgba(15,23,42,.12); }
  .fallback-banner { background: #fff7ed; border: 1px solid #fdba74; color: #7c2d12; padding: 10px 14px; font-family: system-ui, sans-serif; font-size: 12.5px; margin-bottom: 24px; border-radius: 6px; }
  .fallback-banner pre { white-space: pre-wrap; max-height: 180px; overflow: auto; background: #fff; padding: 8px; border-radius: 4px; }
  .test-header { border-bottom: 2px solid #111827; padding-bottom: 14px; margin-bottom: 24px; }
  .institute { font-family: system-ui, sans-serif; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #4b5563; }
  h1 { font-size: 24px; margin: 6px 0 14px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 22px; font-family: system-ui, sans-serif; font-size: 12.5px; }
  .student-line { margin-top: 16px; font-family: system-ui, sans-serif; font-size: 12.5px; }
  .instructions { margin: 10px 0 0; font-size: 13px; font-style: italic; }
  .section { margin-top: 26px; }
  .section h2 { font-size: 16px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
  .section-description { font-size: 13px; color: #4b5563; }
  .item { margin: 18px 0 24px; break-inside: avoid; page-break-inside: avoid; }
  .item-head { display: flex; gap: 10px; align-items: baseline; font-family: system-ui, sans-serif; font-size: 12px; color: #374151; }
  .item-number { font-weight: 700; font-size: 15px; color: #111827; }
  .item-points { font-weight: 700; color: #1d4ed8; }
  .item-type { margin-left: auto; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; color: #6b7280; }
  .item-prompt { margin: 4px 0 10px; }
  .options { list-style: none; padding: 0; margin: 8px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
  .options li { padding: 2px 0; }
  .option-letter { font-family: system-ui, sans-serif; font-weight: 700; font-size: 12px; color: #374151; }
  .answer-lines { margin: 10px 0 4px; }
  .answer-lines .line { display: block; border-bottom: 1px solid #9ca3af; height: 26px; }
  .grid-space { height: 220px; border: 1px solid #9ca3af; background-image: linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px); background-size: 20px 20px; margin: 10px 0; }
  .figure { display: block; max-width: 320px; margin: 10px 0; }
  .data-table, .rubric-table, .simple-table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-family: system-ui, sans-serif; font-size: 12px; }
  .data-table th, .data-table td, .simple-table th, .simple-table td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; }
  .rubric-table th, .rubric-table td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; font-family: system-ui, sans-serif; font-size: 11px; }
  .rubric-table thead th { background: #f3f4f6; }
  .grade-table .threshold { background: #dbeafe; font-weight: 700; }
  .solution { background: #f8fafc; border-left: 3px solid #2563eb; padding: 10px 14px; margin-top: 12px; font-size: 14px; }
  .solution h4 { margin: 8px 0 4px; font-family: system-ui, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #1e40af; }
  .solution ul, .solution ol { margin: 4px 0 8px 18px; padding: 0; }
  .errors { margin-top: 8px; font-size: 13px; }
  .math-display { display: block; text-align: center; margin: 8px 0; }
  .math-fallback { background: #fef3c7; padding: 1px 4px; border-radius: 3px; }
  .page-break { break-before: page; page-break-before: always; margin-top: 30px; }
  .page-break h2 { border-bottom: 2px solid #111827; }
  footer { margin-top: 38px; border-top: 1px solid #d1d5db; padding-top: 8px; font-family: system-ui, sans-serif; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; }
  @media print { body { background: #fff; } .page { box-shadow: none; max-width: none; padding: 0; } .fallback-banner { display: none; } }
</style>
</head>
<body>
<div class="page">
${banner}
${header}
${kind === "griglia" ? rubricHtml(model) : sections}
<footer><span>${escapeHtml(test.title)} — versione ${escapeHtml(test.versionLabel || "A")}</span><span>Pag. 1 di 1 (anteprima)</span></footer>
</div>
</body>
</html>`;
}
