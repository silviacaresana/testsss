import { describe, expect, it } from "vitest";
import { parseCurriculumText } from "@/lib/curriculum/import";

const SAMPLE = `PROGRAMMA SVOLTO DI MATEMATICA — CLASSE PRIMA

Equazioni e disequazioni
- Risolvere equazioni di primo grado intere e frazionarie.
- Discutere e risolvere disequazioni di primo grado.
- Rappresentare le soluzioni sulla retta orientata.

Geometria euclidea
- Conoscere i criteri di congruenza dei triangoli.
- Dimostrare semplici proprietà dei quadrilateri.
- Calcolare perimetri e aree delle figure piane.

Funzioni
- Riconoscere dominio e codominio di una funzione.
- Leggere il grafico di una funzione lineare.`;

describe("import assistito dei programmi", () => {
  it("ricostruisce topic e obiettivi da un testo strutturato", () => {
    const parsed = parseCurriculumText({
      text: SAMPLE,
      track: "classico",
      year: 1,
      subject: "matematica",
      title: "Programma di Matematica — 1ª Classico",
    });

    expect(parsed.track).toBe("classico");
    expect(parsed.year).toBe(1);
    expect(parsed.subject).toBe("matematica");
    expect(parsed.topics.length).toBeGreaterThanOrEqual(3);
    expect(parsed.topics.some((topic) => /Equazioni/i.test(topic.name))).toBe(true);
    expect(parsed.topics.every((topic) => topic.objectives.length >= 1)).toBe(true);
    expect(parsed.topics.every((topic) => topic.code.length >= 2)).toBe(true);
  });

  it("distribuisce i pesi in modo che sommino a circa 100", () => {
    const parsed = parseCurriculumText({
      text: SAMPLE,
      track: "scientifico",
      year: 1,
      subject: "matematica",
      title: "Programma di Matematica — 1ª Scientifico",
    });
    const total = parsed.topics.reduce((sum, topic) => sum + topic.weightHint, 0);
    expect(total).toBeGreaterThanOrEqual(95);
    expect(total).toBeLessThanOrEqual(105);
  });

  it("non inventa argomenti quando il testo è minimale", () => {
    const parsed = parseCurriculumText({
      text: "Argomento unico: calcolo letterale e prodotti notevoli.",
      track: "classico",
      year: 2,
      subject: "matematica",
      title: "Programma minimale",
    });
    expect(parsed.topics).toHaveLength(1);
    expect(parsed.topics[0].objectives.length).toBeGreaterThanOrEqual(1);
    expect(parsed.topics[0].name.toLowerCase()).toContain("argomento unico");
  });
});
