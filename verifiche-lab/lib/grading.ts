import { gradeMappingSchema, type GradeMapping } from "./schemas";
import { clamp, parseJson } from "./utils";

export interface GradeInput {
  score: number;
  totalPoints: number;
  sufficiencyThreshold: number;
  mapping?: GradeMapping | string | null;
}

/** Voto in decimi, arrotondato a 0,25, con soglia di sufficienza = 6. */
export function gradeFromScore({ score, totalPoints, sufficiencyThreshold, mapping }: GradeInput): number {
  const total = totalPoints > 0 ? totalPoints : 100;
  const thresholdPoints = sufficiencyThreshold > 0 ? sufficiencyThreshold : total * 0.6;
  const threshold = clamp((thresholdPoints / total) * 100, 0, 100);
  const percent = clamp((score / total) * 100, 0, 100);

  const parsed: GradeMapping =
    typeof mapping === "string" ? parseJson<GradeMapping>(mapping, { mode: "lineare" }) : mapping ?? { mode: "lineare" };
  const safe = gradeMappingSchema.safeParse(parsed).success ? parsed : { mode: "lineare" as const };

  let grade: number;
  if (safe.mode === "scaglioni" && safe.bands && safe.bands.length > 0) {
    const bands = [...safe.bands].sort((a, b) => b.minPercent - a.minPercent);
    const band = bands.find((b) => percent >= b.minPercent) ?? bands[bands.length - 1];
    grade = band.grade;
  } else if (percent >= threshold) {
    // da 6 a 10 nella fascia sopra la soglia
    const span = 100 - threshold;
    grade = span <= 0 ? 10 : 6 + (4 * (percent - threshold)) / span;
  } else {
    // da 2 a 6 sotto la soglia
    grade = threshold <= 0 ? 6 : 2 + (4 * percent) / threshold;
  }

  return Math.round(clamp(grade, 1, 10) * 4) / 4;
}

export function gradeTable(
  totalPoints: number,
  sufficiencyThreshold: number,
  mapping?: GradeMapping | string | null,
): { percent: number; score: number; grade: number }[] {
  const threshold = sufficiencyThreshold > 0 ? sufficiencyThreshold : 60;
  const percentages = new Set<number>();
  for (let p = 0; p <= 100; p += 5) percentages.add(p);
  percentages.add(Math.round(threshold));
  return [...percentages]
    .sort((a, b) => a - b)
    .map((percent) => {
      const score = Math.round((totalPoints * percent) / 100 * 100) / 100;
      return { percent, score, grade: gradeFromScore({ score, totalPoints, sufficiencyThreshold: threshold, mapping }) };
    });
}

export function indicatorLevel(score: number, maxScore: number): number {
  if (maxScore <= 0) return 1;
  const ratio = score / maxScore;
  if (ratio >= 0.9) return 4;
  if (ratio >= 0.7) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

export function computeIndicatorScores(
  items: { points: number; id: string }[],
  mapping: Record<string, string[]>,
  indicators: string[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const indicator of indicators) result[indicator] = 0;
  for (const item of items) {
    const mapped = mapping[item.id] ?? [];
    if (mapped.length === 0) continue;
    const share = item.points / mapped.length;
    for (const indicator of mapped) {
      if (result[indicator] !== undefined) result[indicator] += share;
    }
  }
  for (const key of Object.keys(result)) result[key] = Math.round(result[key] * 100) / 100;
  return result;
}
