import { describe, expect, it } from "vitest";
import { answerLinesFor, escapeLatexText, formatPercent, formatPoints } from "@/lib/export/latex/escape";

describe("escape LaTeX", () => {
  it("protegge i caratteri speciali fuori dalla matematica", () => {
    expect(escapeLatexText("50% & 3 #1 _test_ {ok} ~^")).toBe(
      "50\\% \\& 3 \\#1 \\_test\\_ \\{ok\\} \\textasciitilde{}\\textasciicircum{}",
    );
  });

  it("lascia intatta la matematica inline e display", () => {
    const escaped = escapeLatexText("Sia $x_1 + y^2$ e $$\\frac{1}{2}$$ nel testo.");
    expect(escaped).toContain("$x_1 + y^2$");
    expect(escaped).toContain("$$\\frac{1}{2}$$");
  });

  it("converte i caratteri tipografici e le unità", () => {
    expect(escapeLatexText("angolo di 90° e area 4 m²")).toContain("\\textdegree{}");
    expect(escapeLatexText("area 4 m²")).toContain("\\textsuperscript{2}");
    expect(escapeLatexText("π ≈ 3,14")).toContain("$\\pi$");
  });

  it("formatta punti e percentuali in italiano", () => {
    expect(formatPoints(10)).toBe("10");
    expect(formatPoints(12.5)).toBe("12,5");
    expect(formatPoints(0.25)).toBe("0,25");
    expect(formatPercent(66.666)).toBe("66,7");
    expect(formatPercent(60)).toBe("60");
  });

  it("non aggiunge righe per le risposte a scelta multipla", () => {
    expect(answerLinesFor("multiple_choice", 3, true)).toBe(0);
    expect(answerLinesFor("true_false", 3, true)).toBe(0);
    expect(answerLinesFor("exercise", 3, false)).toBe(0);
    expect(answerLinesFor("exercise", 3, true)).toBeGreaterThan(0);
  });
});
