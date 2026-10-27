import type { SerializedItem, SerializedTest } from "@/lib/tests/repository";

export interface TopicOption {
  id: string;
  code: string;
  name: string;
  isCore: boolean;
}

export interface GradeScaleOption {
  id: string;
  name: string;
  totalPoints: number;
  sufficiencyThreshold: number;
  mapping: { mode: string; bands?: { minPercent: number; grade: number }[] };
  isDefault: boolean;
}

export interface EditorUser {
  id: string;
  role: string;
}

export type EditorTab = "quesiti" | "anteprima" | "griglia" | "versioni" | "esporta";

export interface ItemFormState {
  type: string;
  prompt: string;
  options: string[];
  correctOption: number | null;
  points: number;
  difficulty: number;
  estimatedMin: number;
  topicId: string;
  answerSpace: string;
  solutionStepsText: string;
  gradingCriteriaText: string;
  commonErrorsText: string;
  hintsText: string;
  notes: string;
}

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function joinLines(values: string[]): string {
  return values.join("\n");
}

export function itemToForm(item: SerializedItem): ItemFormState {
  return {
    type: item.type,
    prompt: item.prompt,
    options: item.options.length > 0 ? [...item.options] : item.type === "true_false" ? ["Vero", "Falso"] : [],
    correctOption: item.correctOption,
    points: item.points,
    difficulty: item.difficulty,
    estimatedMin: item.estimatedMin,
    topicId: item.topicId ?? "",
    answerSpace: item.answerSpace,
    solutionStepsText: joinLines(item.solutionSteps),
    gradingCriteriaText: joinLines(item.gradingCriteria),
    commonErrorsText: joinLines(item.commonErrors),
    hintsText: joinLines(item.hints),
    notes: item.notes,
  };
}

/** Ordine visualizzato: sezioni nell'ordine del documento, poi quesiti orfani. */
export function displayItems(test: SerializedTest): SerializedItem[] {
  const sections = [...test.sections].sort((a, b) => a.order - b.order);
  const sectionIds = new Set(sections.map((section) => section.id));
  const result: SerializedItem[] = [];
  for (const section of sections) {
    result.push(
      ...test.items
        .filter((item) => item.sectionId === section.id)
        .sort((a, b) => a.order - b.order),
    );
  }
  result.push(
    ...test.items
      .filter((item) => !item.sectionId || !sectionIds.has(item.sectionId))
      .sort((a, b) => a.order - b.order),
  );
  return result;
}

export function formatPoints(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function testTotals(test: SerializedTest) {
  return {
    points: Math.round(test.items.reduce((sum, item) => sum + item.points, 0) * 100) / 100,
    minutes: test.items.reduce((sum, item) => sum + item.estimatedMin, 0),
  };
}
