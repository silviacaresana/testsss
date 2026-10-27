import { DIFFICULTY_TABLE } from "@/lib/constants";
import type { GeneratedItem } from "@/lib/schemas";
import type { GenerationRequest } from "@/lib/schemas";

export interface RuleReport {
  errors: string[];
  warnings: string[];
  adjustments: string[];
}

export interface RuleContext {
  request: GenerationRequest;
  topicCodes: Set<string>;
  topicIdToCode: Map<string, string>;
  objectivesByCode: Map<string, string[]>;
}

export interface RuleResult {
  items: GeneratedItem[];
  report: RuleReport;
  ok: boolean;
}

function roundQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

function normalizeForDuplicate(text: string): string {
  return text
    .toLowerCase()
    .replace(/\$[^$]*\$/g, " math ")
    .replace(/\\[a-z]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalizeForDuplicate(text).split(" ").filter((token) => token.length > 1));
}

export function similarity(a: string, b: string): number {
  const setA = tokens(a);
  const setB = tokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

function normalizePoints(items: GeneratedItem[], totalPoints: number, report: RuleReport): void {
  const sum = items.reduce((acc, item) => acc + item.points, 0);
  if (sum <= 0) {
    report.errors.push("La somma dei punteggi è zero: impossibile normalizzare.");
    return;
  }
  if (Math.abs(sum - totalPoints) < 0.0001) return;

  const scale = totalPoints / sum;
  for (const item of items) item.points = Math.max(0.25, roundQuarter(item.points * scale));

  let current = items.reduce((acc, item) => acc + item.points, 0);
  let attempts = 0;
  while (Math.abs(current - totalPoints) > 0.0001 && attempts < 50) {
    const delta = roundQuarter(totalPoints - current);
    const target = [...items].filter((item) => item.points + delta >= 0.25).sort((a, b) => b.points - a.points)[0];
    if (!target) break;
    target.points = Math.max(0.25, roundQuarter(target.points + delta));
    current = items.reduce((acc, item) => acc + item.points, 0);
    attempts += 1;
  }

  const finalSum = items.reduce((acc, item) => acc + item.points, 0);
  if (Math.abs(finalSum - totalPoints) > 0.0001) {
    report.errors.push(
      `Impossibile far coincidere i punteggi: richiesti ${totalPoints}, ottenuti ${finalSum}. Usa un totale multiplo di 0,25.`,
    );
  } else {
    report.adjustments.push(
      `Punteggi ricalibrati proporzionalmente da ${roundQuarter(sum)} a ${totalPoints} punti (scala ${scale.toFixed(3)}).`,
    );
  }
}

function normalizeTimes(items: GeneratedItem[], durationMin: number, report: RuleReport): void {
  const sum = items.reduce((acc, item) => acc + item.estimated_min, 0);
  if (sum <= 0) {
    report.errors.push("Tempo stimato nullo: impossibile rispettare la durata.");
    return;
  }
  if (Math.abs(sum - durationMin) <= durationMin * 0.1) return;

  const scale = durationMin / sum;
  for (const item of items) item.estimated_min = Math.max(1, Math.round(item.estimated_min * scale));
  let current = items.reduce((acc, item) => acc + item.estimated_min, 0);
  let attempts = 0;
  while (current !== durationMin && attempts < 60) {
    const delta = Math.sign(durationMin - current);
    const candidates = [...items].filter((item) => item.estimated_min + delta >= 1).sort((a, b) => b.estimated_min - a.estimated_min);
    if (candidates.length === 0) break;
    candidates[0].estimated_min += delta;
    current = items.reduce((acc, item) => acc + item.estimated_min, 0);
    attempts += 1;
  }
  report.adjustments.push(
    `Tempi stimati riscalati da ${sum} a ${current} minuti per rispettare la durata richiesta (${durationMin} min).`,
  );
}

export function applyRules(itemsInput: GeneratedItem[], context: RuleContext): RuleResult {
  const report: RuleReport = { errors: [], warnings: [], adjustments: [] };
  const items = itemsInput.map((item) => ({
    ...item,
    options: [...item.options],
    solution_steps: [...item.solution_steps],
    grading_criteria: [...item.grading_criteria],
    common_errors: [...item.common_errors],
    hints: [...item.hints],
    objectives: [...item.objectives],
  }));

  const { request, topicCodes, objectivesByCode } = context;

  if (items.length === 0) {
    return { items, report: { errors: ["Nessun quesito generato."], warnings: [], adjustments: [] }, ok: false };
  }

  if (items.length !== request.itemCount) {
    report.warnings.push(
      `Numero di quesiti: richiesti ${request.itemCount}, generati ${items.length}. Controlla la struttura della verifica.`,
    );
  }

  const totalIsQuarter = Math.abs(request.totalPoints * 4 - Math.round(request.totalPoints * 4)) < 1e-9;
  if (!totalIsQuarter) {
    report.errors.push("Il punteggio totale deve essere intero o con decimali .25/.50.");
  }

  for (const item of items) {
    if (Math.abs(item.points * 4 - Math.round(item.points * 4)) > 1e-9) {
      item.points = Math.max(0.25, roundQuarter(item.points));
    }
    if (!topicCodes.has(item.topic_code)) {
      report.errors.push(`Quesito ${item.id}: il topic "${item.topic_code}" non esiste nel curriculum selezionato.`);
    }
    const validObjectives = objectivesByCode.get(item.topic_code) ?? [];
    const unknown = item.objectives.filter((code) => !validObjectives.includes(code));
    if (unknown.length > 0) {
      report.warnings.push(
        `Quesito ${item.id}: obiettivi non presenti nel topic ${item.topic_code} (${unknown.join(", ")}).`,
      );
      item.objectives = item.objectives.filter((code) => validObjectives.includes(code));
    }
    if (item.objectives.length === 0 && validObjectives.length > 0) {
      item.objectives = [validObjectives[0]];
    }

    if (item.solution_steps.length === 0) {
      report.errors.push(`Quesito ${item.id}: manca la soluzione svolta.`);
    }
    if (item.grading_criteria.length === 0) {
      report.errors.push(`Quesito ${item.id}: mancano i criteri di punteggio.`);
    }
    if (item.type === "multiple_choice") {
      if (item.options.length !== 4) {
        report.warnings.push(`Quesito ${item.id}: la scelta multipla dovrebbe avere 4 opzioni (ne ha ${item.options.length}).`);
      }
      if (item.correct_option === null || item.correct_option < 0 || item.correct_option >= item.options.length) {
        report.errors.push(`Quesito ${item.id}: risposta corretta non valida.`);
      }
    }
    if (item.type === "true_false" && item.options.length > 0) {
      report.warnings.push(`Quesito ${item.id}: il vero/falso non dovrebbe avere opzioni multiple.`);
    }

    const row = DIFFICULTY_TABLE.find((entry) => entry.level === item.difficulty);
    if (row && (item.estimated_min < row.min * 0.5 || item.estimated_min > row.max * 2)) {
      report.warnings.push(
        `Quesito ${item.id}: tempo stimato ${item.estimated_min} min poco coerente con difficoltà ${item.difficulty}.`,
      );
    }
    if (request.subject === "fisica" && /\d/.test(item.prompt) && !/\\,?\s*(mathrm|SI)|m\/s|kg|\\Omega|\\circ|N\b|J\b|W\b|Pa\b/.test(item.prompt)) {
      report.warnings.push(`Quesito ${item.id}: verifica che tutte le grandezze abbiano l'unità di misura.`);
    }
  }

  normalizePoints(items, request.totalPoints, report);
  normalizeTimes(items, request.durationMin, report);

  for (const selected of request.selectedTopics) {
    const code = context.topicIdToCode.get(selected.topicId);
    if (!code) {
      report.errors.push(`Argomento selezionato non trovato nel curriculum: ${selected.topicId}`);
    }
  }

  const usedCodes = new Set(items.map((item) => item.topic_code));
  for (const selected of request.selectedTopics) {
    const code = context.topicIdToCode.get(selected.topicId);
    if (code && !usedCodes.has(code)) {
      report.errors.push(`Nessun quesito copre l'argomento "${code}".`);
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const score = similarity(items[i].prompt, items[j].prompt);
      if (score >= 0.95) {
        report.errors.push(`Quesiti ${items[i].id} e ${items[j].id} troppo simili (${Math.round(score * 100)}%): rigenera uno dei due.`);
      } else if (score >= 0.85) {
        report.warnings.push(`Quesiti ${items[i].id} e ${items[j].id} simili (${Math.round(score * 100)}%).`);
      }
    }
  }

  const averageDifficulty = items.reduce((acc, item) => acc + item.difficulty, 0) / items.length;
  if (Math.abs(averageDifficulty - request.difficultyTarget) > 0.9) {
    report.warnings.push(
      `Difficoltà media ${averageDifficulty.toFixed(1)} lontana dal target ${request.difficultyTarget}.`,
    );
  }

  const totalTime = items.reduce((acc, item) => acc + item.estimated_min, 0);
  if (Math.abs(totalTime - request.durationMin) > request.durationMin * 0.1) {
    report.errors.push(`Tempo stimato ${totalTime} min fuori tolleranza (±10% di ${request.durationMin} min).`);
  }

  return { items, report, ok: report.errors.length === 0 };
}
