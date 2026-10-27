import {
  DEFAULT_INDICATORS,
  DEFAULT_LEVELS,
  itemTypeLabel,
  subjectLabel,
  trackLabel,
} from "@/lib/constants";
import { computeIndicatorScores, gradeTable } from "@/lib/grading";
import { formatDateIT, parseJson, slugify } from "@/lib/utils";
import type { TestForExport } from "./types";
import {
  answerLinesFor,
  escapeLatexText,
  figureTikz,
  formatPercent,
  formatPoints,
} from "./latex/escape";

export interface RenderItem {
  id: string;
  number: number;
  type: string;
  typeLabel: string;
  promptTex: string;
  optionsTex: string[];
  correctLetter: string | null;
  points: number;
  pointsTex: string;
  difficulty: number;
  estimatedMin: number;
  topicTex: string;
  objectivesTex: string;
  solutionStepsTex: string[];
  criteriaTex: string[];
  errorsTex: string[];
  hintsTex: string[];
  introTex: string;
  answerLines: number;
  needspace: number;
  figureTikz: string | null;
}

export interface RenderSection {
  id: string;
  titleTex: string;
  descriptionTex: string;
  items: RenderItem[];
}

export interface ExportModel {
  baseName: string;
  titleTex: string;
  instituteTex: string;
  trackTex: string;
  subjectTex: string;
  classTex: string;
  dateTex: string;
  durationTex: string;
  pointsTex: string;
  thresholdTex: string;
  thresholdPointsTex: string;
  itemCount: number;
  instructions: string;
  formulaSheet: boolean;
  formulaSheetText: string;
  notesTex: string;
  logoFile: string | null;
  sections: RenderSection[];
  items: RenderItem[];
  indicators: string[];
  levels: { level: number; labelTex: string; descriptorTex: string }[];
  indicatorRows: {
    indicatorTex: string;
    level1Tex: string;
    level2Tex: string;
    level3Tex: string;
    level4Tex: string;
  }[];
  indicatorTotals: { indicatorTex: string; pointsTex: string; percentTex: string }[];
  itemRows: {
    number: number;
    typeTex: string;
    pointsTex: string;
    indicatorsTex: string;
    criteriaTex: string;
  }[];
  gradeRows: { scoreTex: string; percent: string; gradeTex: string; isThreshold: boolean }[];
}

export interface BuildOptions {
  instituteName?: string;
  logoFile?: string | null;
}

const INDICATOR_DESCRIPTORS: Record<string, string[]> = {
  Conoscenze: [
    "Conosce in modo frammentario e superficiale i concetti; commette errori anche in situazioni note.",
    "Conosce i concetti essenziali; li richiama correttamente in situazioni standard.",
    "Conosce i concetti in modo completo e li collega tra loro in modo pertinente.",
    "Padroneggia i concetti, li collega e li utilizza anche in contesti nuovi.",
  ],
  "Abilità procedurali": [
    "Applica le procedure con errori frequenti e necessita di guida costante.",
    "Applica le procedure essenziali in modo corretto in situazioni note.",
    "Applica le procedure in modo corretto, ordinato e consapevole.",
    "Applica le procedure con sicurezza, scegliendo la strategia più efficiente.",
  ],
  "Risoluzione di problemi": [
    "Riconosce solo parzialmente i dati e non individua una strategia risolutiva.",
    "Imposta il problema in modo essenziale e risolve semplici situazioni standard.",
    "Imposta e risolve problemi articolati, motivando le scelte principali.",
    "Analizza problemi complessi, generalizza e valuta la plausibilità del risultato.",
  ],
  "Linguaggio e argomentazione": [
    "Espone in modo confuso, con lessico e simboli usati in modo improprio.",
    "Espone in modo comprensibile, con lessico essenziale e qualche imprecisione.",
    "Espone in modo chiaro e corretto, usando il linguaggio specifico.",
    "Argomenta in modo rigoroso, essenziale e ben strutturato.",
  ],
};

function isoDate(date: Date | null | undefined, fallback: Date): string {
  const d = date ?? fallback;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildFileName(test: TestForExport): { baseName: string; dateIso: string } {
  const dateIso = isoDate(test.examDate, test.createdAt);
  const slug = slugify(test.title);
  const baseName = `verifica-${test.subject}-${test.year}-${test.track}-${dateIso}-${slug}-v${test.versionLabel || "A"}`;
  return { baseName, dateIso };
}

export function deriveIndicators(type: string, indicators: string[]): string[] {
  const first = indicators[0] ?? "Conoscenze";
  const second = indicators[1] ?? first;
  const third = indicators[2] ?? second;
  const fourth = indicators[3] ?? third;
  switch (type) {
    case "multiple_choice":
    case "true_false":
      return [first];
    case "short_answer":
      return [first, fourth];
    case "exercise":
      return [second];
    case "problem":
    case "lab_data":
      return [second, third];
    case "graph":
      return [third, fourth];
    case "proof":
    case "open_answer":
      return [fourth, third];
    default:
      return [first];
  }
}

export function buildExportModel(test: TestForExport, options: BuildOptions = {}): ExportModel {
  const { baseName } = buildFileName(test);
  const rubricIndicators = test.rubric
    ? parseJson<string[]>(test.rubric.indicatorsJson, [...DEFAULT_INDICATORS])
    : [...DEFAULT_INDICATORS];
  const indicators = rubricIndicators.length > 0 ? rubricIndicators : [...DEFAULT_INDICATORS];

  const rubricLevels = test.rubric
    ? parseJson<{ level: number; label: string; descriptor: string }[]>(
        test.rubric.levelsJson,
        DEFAULT_LEVELS.map((level) => ({ ...level })),
      )
    : DEFAULT_LEVELS.map((level) => ({ ...level }));
  const levels = [1, 2, 3, 4].map((level) => {
    const found = rubricLevels.find((entry) => entry.level === level);
    const fallback = DEFAULT_LEVELS.find((entry) => entry.level === level)!;
    return {
      level,
      labelTex: escapeLatexText(found?.label ?? fallback.label),
      descriptorTex: escapeLatexText(found?.descriptor ?? fallback.descriptor),
    };
  });

  const mappingFromRubric = test.rubric
    ? parseJson<Record<string, string[]>>(test.rubric.itemMappingJson, {})
    : {};
  const mapping: Record<string, string[]> = {};
  for (const item of test.items) {
    const mapped = (mappingFromRubric[item.id] ?? []).filter((name) => indicators.includes(name));
    mapping[item.id] = mapped.length > 0 ? mapped : deriveIndicators(item.type, indicators);
  }

  const sectionsDb = [...test.sections].sort((a, b) => a.order - b.order);
  const itemsDb = [...test.items].sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime());

  const ordered: { item: (typeof itemsDb)[number]; sectionId: string | null }[] = [];
  for (const section of sectionsDb) {
    for (const item of itemsDb.filter((candidate) => candidate.sectionId === section.id)) {
      ordered.push({ item, sectionId: section.id });
    }
  }
  const orphans = itemsDb.filter((item) => !item.sectionId || !sectionsDb.some((s) => s.id === item.sectionId));
  for (const item of orphans) ordered.push({ item, sectionId: null });

  let counter = 0;
  const renderItems = new Map<string, RenderItem>();
  for (const { item } of ordered) {
    counter += 1;
    const lines = item.answerLines > 0 ? item.answerLines : answerLinesFor(item.type, item.difficulty, test.answerSpace);
    const correctLetter =
      item.correctOption !== null && item.correctOption !== undefined
        ? String.fromCharCode(65 + item.correctOption)
        : null;
    const renderItem: RenderItem = {
      id: item.id,
      number: counter,
      type: item.type,
      typeLabel: itemTypeLabel(item.type),
      promptTex: escapeLatexText(item.prompt),
      optionsTex: parseJson<string[]>(item.options, []).map((option) => escapeLatexText(option)),
      correctLetter,
      points: item.points,
      pointsTex: formatPoints(item.points),
      difficulty: item.difficulty,
      estimatedMin: item.estimatedMin,
      topicTex: item.topic ? escapeLatexText(item.topic.name) : "",
      objectivesTex: parseJson<string[]>(item.objectives, []).map((code) => escapeLatexText(code)).join(", "),
      solutionStepsTex: parseJson<string[]>(item.solutionSteps, []).map((step) => escapeLatexText(step)),
      criteriaTex: parseJson<string[]>(item.gradingCriteria, []).map((criterion) => escapeLatexText(criterion)),
      errorsTex: parseJson<string[]>(item.commonErrors, []).map((error) => escapeLatexText(error)),
      hintsTex: parseJson<string[]>(item.hints, []).map((hint) => escapeLatexText(hint)),
      introTex: "",
      answerLines: lines,
      needspace: Math.max(5, 3 + Math.ceil(lines / 2)),
      figureTikz: item.figureSpec ? figureTikz(parseJson<unknown>(item.figureSpec, null)) : null,
    };
    renderItems.set(item.id, renderItem);
  }

  const sections: RenderSection[] = sectionsDb.map((section) => ({
    id: section.id,
    titleTex: escapeLatexText(section.title),
    descriptionTex: escapeLatexText(section.description),
    items: ordered
      .filter((entry) => entry.sectionId === section.id)
      .map((entry) => renderItems.get(entry.item.id)!)
      .filter(Boolean),
  }));
  if (orphans.length > 0) {
    sections.push({
      id: "extra",
      titleTex: "Quesiti",
      descriptionTex: "",
      items: orphans.map((item) => renderItems.get(item.id)!).filter(Boolean),
    });
  }

  const allItems = [...renderItems.values()];
  const threshold = test.gradeScale?.sufficiencyThreshold ?? 60;
  const thresholdPoints = (test.totalPoints * threshold) / 100;
  const gradeMapping = test.gradeScale?.mappingJson ?? null;

  const indicatorTotalsRaw = computeIndicatorScores(
    allItems.map((item) => ({ id: item.id, points: item.points })),
    mapping,
    indicators,
  );
  const indicatorTotals = indicators.map((indicator) => ({
    indicatorTex: escapeLatexText(indicator),
    pointsTex: formatPoints(indicatorTotalsRaw[indicator] ?? 0),
    percentTex: formatPercent(((indicatorTotalsRaw[indicator] ?? 0) / test.totalPoints) * 100),
  }));

  const indicatorRows = indicators.map((indicator) => {
    const specific = INDICATOR_DESCRIPTORS[indicator];
    return {
      indicatorTex: escapeLatexText(indicator),
      level1Tex: specific ? escapeLatexText(specific[0]) : levels[0].descriptorTex,
      level2Tex: specific ? escapeLatexText(specific[1]) : levels[1].descriptorTex,
      level3Tex: specific ? escapeLatexText(specific[2]) : levels[2].descriptorTex,
      level4Tex: specific ? escapeLatexText(specific[3]) : levels[3].descriptorTex,
    };
  });

  const itemRows = allItems.map((item) => ({
    number: item.number,
    typeTex: escapeLatexText(item.typeLabel),
    pointsTex: item.pointsTex,
    indicatorsTex: (mapping[item.id] ?? []).map((name) => escapeLatexText(name)).join(", "),
    criteriaTex: item.criteriaTex.join("; "),
  }));

  const gradeRows = gradeTable(test.totalPoints, threshold, gradeMapping).map((row) => ({
    scoreTex: formatPoints(row.score),
    percent: formatPercent(row.percent),
    gradeTex: formatPoints(row.grade),
    isThreshold: Math.abs(row.percent - threshold) < 0.01,
  }));

  const instructionParts: string[] = [];
  instructionParts.push(
    test.calculatorAllowed
      ? "È consentito l'uso della calcolatrice."
      : "Non è consentito l'uso della calcolatrice.",
  );
  if (test.formulaSheet) instructionParts.push("È allegato il formulario.");
  if (test.trigTables) instructionParts.push("Sono consentite le tavole goniometriche.");
  if (test.noDerivatives) instructionParts.push("Non usare le derivate.");
  if (test.onlyDefinitions) instructionParts.push("Sono richieste solo definizioni e giustificazioni, non calcoli.");
  if (test.simplifiedLanguage) instructionParts.push("Linguaggio semplificato (DSA/BES).");
  if (test.answerSpace) instructionParts.push("Scrivi lo svolgimento negli spazi indicati.");

  return {
    baseName,
    titleTex: escapeLatexText(test.title),
    instituteTex: escapeLatexText(options.instituteName || process.env.INSTITUTE_NAME || "Istituto scolastico"),
    trackTex: escapeLatexText(trackLabel(test.track)),
    subjectTex: escapeLatexText(subjectLabel(test.subject)),
    classTex: escapeLatexText(test.classLabel || String(test.year)),
    dateTex: escapeLatexText(formatDateIT(test.examDate ?? test.createdAt)),
    durationTex: String(test.durationMin),
    pointsTex: formatPoints(test.totalPoints),
    thresholdTex: formatPercent(threshold),
    thresholdPointsTex: formatPoints(thresholdPoints),
    itemCount: allItems.length,
    instructions: escapeLatexText(instructionParts.join(" ")),
    formulaSheet: test.formulaSheet,
    formulaSheetText: escapeLatexText("Formulario fornito dal docente."),
    notesTex: "",
    logoFile: options.logoFile ?? null,
    sections,
    items: allItems,
    indicators: indicators.map((indicator) => escapeLatexText(indicator)),
    levels,
    indicatorRows,
    indicatorTotals,
    itemRows,
    gradeRows,
  };
}
