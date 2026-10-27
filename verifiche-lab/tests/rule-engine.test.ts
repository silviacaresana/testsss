import { describe, expect, it } from "vitest";
import type { GeneratedItem, GenerationRequest } from "@/lib/schemas";
import { applyRules, similarity } from "@/lib/generation/rule-engine";

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    title: "Verifica di prova",
    track: "classico",
    year: 1,
    subject: "matematica",
    curriculumId: "curriculum-1",
    classLabel: "1ª A",
    examDate: null,
    durationMin: 60,
    totalPoints: 100,
    difficultyTarget: 3,
    selectedTopics: [{ topicId: "topic-1", weight: 100 }],
    itemCount: 4,
    types: ["exercise"],
    longProblem: false,
    theoryQuestions: false,
    calculatorAllowed: false,
    formulaSheet: false,
    trigTables: false,
    noDerivatives: false,
    onlyDefinitions: false,
    simplifiedLanguage: false,
    answerSpace: true,
    versions: 1,
    vary: "numeri",
    ...overrides,
  };
}

function item(overrides: Partial<GeneratedItem> = {}): GeneratedItem {
  return {
    id: "q1",
    section_id: "s1",
    type: "exercise",
    prompt: "Risolvi l'equazione $2x+3=11$.",
    options: [],
    correct_option: null,
    points: 20,
    difficulty: 3,
    estimated_min: 10,
    topic_code: "EQ1",
    objectives: ["EQ1.1"],
    solution_steps: ["Sottrai 3: $2x=8$.", "Dividi per 2: $x=4$."],
    grading_criteria: ["Imposta correttamente l'equazione: 1 punto.", "Soluzione: 1 punto."],
    common_errors: [],
    hints: [],
    answer_space: "lined",
    figure_spec: null,
    is_locked: false,
    variant_group: null,
    ...overrides,
  };
}

const context = {
  request: request(),
  topicCodes: new Set(["EQ1"]),
  topicIdToCode: new Map([["topic-1", "EQ1"]]),
  objectivesByCode: new Map([["EQ1", ["EQ1.1", "EQ1.2"]]]),
};

describe("motore delle regole", () => {
  it("porta punteggi e tempi esattamente a 100 punti e 60 minuti", () => {
    const items = [
      item({ id: "q1", points: 10, estimated_min: 8 }),
      item({ id: "q2", prompt: "Risolvi $x^2-5x+6=0$.", points: 20, estimated_min: 12 }),
      item({ id: "q3", prompt: "Calcola l'area di un triangolo di base 6 e altezza 4.", points: 20, estimated_min: 12 }),
      item({ id: "q4", prompt: "Verifica se $x=2$ è soluzione di $3x-1=5$.", points: 10, estimated_min: 8 }),
    ];
    const result = applyRules(items, context);
    const points = result.items.reduce((sum, entry) => sum + entry.points, 0);
    const minutes = result.items.reduce((sum, entry) => sum + entry.estimated_min, 0);
    expect(points).toBeCloseTo(100, 6);
    expect(minutes).toBe(60);
    expect(result.ok).toBe(true);
    expect(result.report.adjustments.join(" ")).toContain("Punteggi ricalibrati");
  });

  it("rifiuta un quesito senza soluzione svolta o senza criteri", () => {
    const result = applyRules([item({ solution_steps: [], grading_criteria: [] })], {
      ...context,
      request: request({ itemCount: 1 }),
    });
    expect(result.ok).toBe(false);
    expect(result.report.errors.join(" ")).toContain("manca la soluzione svolta");
    expect(result.report.errors.join(" ")).toContain("mancano i criteri");
  });

  it("segnala argomenti non coperti e topic inesistenti", () => {
    const result = applyRules([item({ topic_code: "SCONOSCIUTO" })], context);
    expect(result.ok).toBe(false);
    expect(result.report.errors.join(" ")).toContain("non esiste nel curriculum");
    expect(result.report.errors.join(" ")).toContain('Nessun quesito copre l\'argomento "EQ1"');
  });

  it("riconosce quesiti quasi identici", () => {
    expect(similarity("Risolvi l'equazione 2x+3=11", "Risolvi l'equazione 2x+3=11")).toBe(1);
    expect(similarity("Risolvi l'equazione 2x+3=11", "Disegna il grafico di una parabola")).toBeLessThan(0.5);
    expect(similarity("$x^2$ e $x^2$", "$y^2$")).toBeGreaterThanOrEqual(0);
  });

  it("blocca un totale non multiplo di 0,25", () => {
    const result = applyRules([item()], { ...context, request: request({ totalPoints: 100.1, itemCount: 1 }) });
    expect(result.ok).toBe(false);
    expect(result.report.errors.join(" ")).toContain("multiplo di 0,25");
  });
});
