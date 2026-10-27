import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { exportZip } from "@/lib/export/service";
import { extractPdfText } from "@/lib/pdf/text";
import type { SessionUser } from "@/lib/auth/session";

const hasDatabase = fs.existsSync(path.join(process.cwd(), "prisma", "dev.db"));

function parseList(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

describe.skipIf(!hasDatabase)("accettazione sul database dimostrativo", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("le verifiche dimostrative rispettano 100 punti, 54–66 minuti e hanno soluzioni e criteri", async () => {
    const tests = await prisma.test.findMany({
      where: { title: { startsWith: "Verifica dimostrativa" } },
      include: { items: { orderBy: { order: "asc" } } },
      orderBy: { title: "asc" },
    });

    expect(tests.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tests.map((test) => test.track))).toEqual(new Set(["classico", "scientifico"]));

    for (const test of tests) {
      const points = test.items.reduce((sum, item) => sum + item.points, 0);
      const minutes = test.items.reduce((sum, item) => sum + item.estimatedMin, 0);
      expect(points, `${test.title}: punti`).toBeCloseTo(100, 6);
      expect(minutes, `${test.title}: minuti`).toBeGreaterThanOrEqual(54);
      expect(minutes, `${test.title}: minuti`).toBeLessThanOrEqual(66);

      for (const item of test.items) {
        const solutionSteps = parseList(item.solutionSteps);
        const gradingCriteria = parseList(item.gradingCriteria);
        expect(solutionSteps.length, `${test.title} / ${item.id}: soluzione`).toBeGreaterThan(0);
        expect(gradingCriteria.length, `${test.title} / ${item.id}: criteri`).toBeGreaterThan(0);
      }
    }
  });

  it("esporta un pacchetto ZIP con gli otto file attesi e PDF con «Pag. X di Y»", async () => {
    const teacher = await prisma.user.findFirst({ where: { email: "docente@verifichelab.local" } });
    const test = await prisma.test.findFirst({
      where: { title: { startsWith: "Verifica dimostrativa" }, track: "scientifico" },
    });
    expect(teacher).not.toBeNull();
    expect(test).not.toBeNull();

    const user: SessionUser = {
      id: teacher!.id,
      email: teacher!.email,
      name: teacher!.name,
      role: teacher!.role,
      subjects: teacher!.subjects,
      tracks: teacher!.tracks,
    };

    const bundle = await exportZip(test!.id, user);
    const zip = await JSZip.loadAsync(bundle.buffer);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

    expect(names).toHaveLength(8);
    expect(names.filter((name) => name.endsWith(".tex"))).toHaveLength(3);
    expect(names.filter((name) => name.endsWith(".pdf"))).toHaveLength(3);
    expect(names.filter((name) => name.endsWith(".json"))).toHaveLength(1);
    expect(names).toContain("README.txt");
    for (const prefix of ["verifica-", "soluzioni-", "griglia-"]) {
      expect(names.some((name) => name.startsWith(prefix) && name.endsWith(".tex"))).toBe(true);
      expect(names.some((name) => name.startsWith(prefix) && name.endsWith(".pdf"))).toBe(true);
    }

    const verificationTex = await zip.file(names.find((name) => name.startsWith("verifica-") && name.endsWith(".tex"))!)!.async("string");
    expect(verificationTex).toContain("100");
    expect(verificationTex).toContain("Pag.");

    const pdfName = names.find((name) => name.startsWith("verifica-") && name.endsWith(".pdf"))!;
    const pdfBytes = await zip.file(pdfName)!.async("uint8array");
    const extracted = await extractPdfText(pdfBytes);
    expect(extracted.pages).toBeGreaterThan(0);
    expect(extracted.text).toMatch(/Pag\.\s*1\s*di\s*\d+/);
    expect(extracted.text).toContain("100");
  });
});
