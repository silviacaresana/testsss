import { describe, expect, it } from "vitest";
import { parseAiJson } from "@/lib/ai/pipeline";
import { generatedTestSchema } from "@/lib/schemas";

const valid = {
  meta: {
    title: "Verifica di prova",
    track: "classico",
    year: 1,
    subject: "matematica",
    duration_min: 60,
    total_points: 100,
    difficulty_target: 2.5,
    calculator_allowed: false,
  },
  sections: [{ id: "s1", title: "Quesiti", description: "Rispondi a tutti i quesiti." }],
  items: [
    {
      id: "i1",
      section_id: "s1",
      type: "exercise",
      prompt: "Risolvi $2x+1=5$.",
      options: [],
      correct_option: null,
      points: 10,
      difficulty: 2,
      estimated_min: 6,
      topic_code: "EQ1",
      objectives: ["EQ1.1"],
      solution_steps: ["$2x=4$", "$x=2$"],
      grading_criteria: ["Impostazione: 1 punto", "Risultato: 1 punto"],
      common_errors: [],
      hints: [],
      answer_space: "lined",
      is_locked: false,
    },
  ],
  rubric: {
    indicators: ["Conoscenze"],
    item_mapping: { i1: ["Conoscenze"] },
    levels: [
      { level: 1, label: "Iniziale", descriptor: "…" },
      { level: 2, label: "Base", descriptor: "…" },
    ],
  },
};

describe("contratto AI", () => {
  it("accetta una risposta valida", () => {
    expect(generatedTestSchema.safeParse(valid).success).toBe(true);
  });

  it("rifiuta item senza soluzione, criteri o con punti non validi", () => {
    const noSolution = structuredClone(valid);
    noSolution.items[0].solution_steps = [];
    expect(generatedTestSchema.safeParse(noSolution).success).toBe(false);

    const noCriteria = structuredClone(valid);
    noCriteria.items[0].grading_criteria = [];
    expect(generatedTestSchema.safeParse(noCriteria).success).toBe(false);

    const badPoints = structuredClone(valid);
    badPoints.items[0].points = 10.3;
    expect(generatedTestSchema.safeParse(badPoints).success).toBe(false);
  });

  it("rifiuta un topic code mancante o un tipo sconosciuto", () => {
    const noTopic = structuredClone(valid);
    noTopic.items[0].topic_code = "";
    expect(generatedTestSchema.safeParse(noTopic).success).toBe(false);

    const badType = structuredClone(valid);
    badType.items[0].type = "chat";
    expect(generatedTestSchema.safeParse(badType).success).toBe(false);
  });

  it("estrae JSON da code fence e da testo circostante", () => {
    expect(parseAiJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseAiJson('Ecco il risultato: {"ok":true} — fine.')).toEqual({ ok: true });
  });

  it("segnala una risposta vuota o non JSON", () => {
    expect(() => parseAiJson("")).toThrow(/vuota/);
    expect(() => parseAiJson("non è json")).toThrow(/JSON non valido/);
  });
});
