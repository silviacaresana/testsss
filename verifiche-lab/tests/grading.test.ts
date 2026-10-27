import { describe, expect, it } from "vitest";
import { computeIndicatorScores, gradeFromScore, gradeTable, indicatorLevel } from "@/lib/grading";

const base = { totalPoints: 100, sufficiencyThreshold: 60 };

describe("conversione punteggio/voto", () => {
  it("assegna 6 con il 60%, 10 con il 100% e 2 con lo 0%", () => {
    expect(gradeFromScore({ ...base, score: 60 })).toBe(6);
    expect(gradeFromScore({ ...base, score: 100 })).toBe(10);
    expect(gradeFromScore({ ...base, score: 0 })).toBe(2);
  });

  it("interpola linearmente nella fascia di sufficienza", () => {
    expect(gradeFromScore({ ...base, score: 80 })).toBe(8);
    expect(gradeFromScore({ ...base, score: 40 })).toBe(4.75);
  });

  it("rispetta una mappatura a scaglioni", () => {
    const mapping = {
      mode: "scaglioni" as const,
      bands: [
        { minPercent: 0, grade: 2 },
        { minPercent: 50, grade: 5 },
        { minPercent: 65, grade: 6 },
        { minPercent: 80, grade: 8 },
        { minPercent: 95, grade: 10 },
      ],
    };
    expect(gradeFromScore({ ...base, score: 84, mapping })).toBe(8);
    expect(gradeFromScore({ ...base, score: 99, mapping })).toBe(10);
    expect(gradeFromScore({ ...base, score: 65, mapping })).toBe(6);
  });

  it("gestisce una scala personalizzata con soglia in punti", () => {
    expect(gradeFromScore({ score: 30, totalPoints: 50, sufficiencyThreshold: 30 })).toBe(6);
    expect(gradeFromScore({ score: 50, totalPoints: 50, sufficiencyThreshold: 30 })).toBe(10);
  });

  it("produce una tabella ordinata e coerente", () => {
    const table = gradeTable(100, 60);
    expect(table[0]).toEqual({ percent: 0, score: 0, grade: 2 });
    expect(table.at(-1)).toEqual({ percent: 100, score: 100, grade: 10 });
    expect(table.find((row) => row.percent === 60)?.grade).toBe(6);
  });

  it("calcola i livelli degli indicatori e la ripartizione dei punti", () => {
    expect(indicatorLevel(9, 10)).toBe(4);
    expect(indicatorLevel(7, 10)).toBe(3);
    expect(indicatorLevel(5, 10)).toBe(2);
    expect(indicatorLevel(4, 10)).toBe(1);
    expect(
      computeIndicatorScores(
        [
          { id: "q1", points: 10 },
          { id: "q2", points: 20 },
        ],
        { q1: ["Conoscenze", "Abilità procedurali"], q2: ["Abilità procedurali"] },
        ["Conoscenze", "Abilità procedurali"],
      ),
    ).toEqual({ Conoscenze: 5, "Abilità procedurali": 25 });
  });
});
