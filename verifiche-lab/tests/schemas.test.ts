import { describe, expect, it } from "vitest";
import { generationRequestSchema, gradeMappingSchema, pointValueSchema } from "@/lib/schemas";

const validRequest = {
  title: "Verifica di matematica",
  track: "scientifico",
  year: 2,
  subject: "matematica",
  curriculumId: "curriculum-1",
  durationMin: 60,
  totalPoints: 100,
  difficultyTarget: 3,
  selectedTopics: [{ topicId: "topic-1", weight: 100 }],
  itemCount: 8,
  types: ["multiple_choice", "exercise"],
};

describe("schemi di validazione", () => {
  it("accetta una richiesta completa e applica i valori predefiniti", () => {
    const parsed = generationRequestSchema.parse(validRequest);
    expect(parsed.answerSpace).toBe(true);
    expect(parsed.versions).toBe(1);
    expect(parsed.vary).toBe("numeri");
    expect(parsed.calculatorAllowed).toBe(false);
  });

  it("rifiuta anni, conteggi e tipologie fuori intervallo", () => {
    expect(generationRequestSchema.safeParse({ ...validRequest, year: 6 }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...validRequest, itemCount: 2 }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...validRequest, selectedTopics: [] }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...validRequest, types: [] }).success).toBe(false);
    expect(generationRequestSchema.safeParse({ ...validRequest, durationMin: 10 }).success).toBe(false);
  });

  it("accetta solo punteggi interi o con .25/.50", () => {
    expect(pointValueSchema.safeParse(0.25).success).toBe(true);
    expect(pointValueSchema.safeParse(1.5).success).toBe(true);
    expect(pointValueSchema.safeParse(2).success).toBe(true);
    expect(pointValueSchema.safeParse(0.3).success).toBe(false);
    expect(pointValueSchema.safeParse(0.1).success).toBe(false);
    expect(pointValueSchema.safeParse(0).success).toBe(false);
  });

  it("valida le mappature dei voti", () => {
    expect(gradeMappingSchema.safeParse({ mode: "lineare" }).success).toBe(true);
    expect(
      gradeMappingSchema.safeParse({
        mode: "scaglioni",
        bands: [{ minPercent: 60, grade: 6 }],
      }).success,
    ).toBe(true);
    expect(gradeMappingSchema.safeParse({ mode: "inspiegabile" }).success).toBe(false);
  });
});
