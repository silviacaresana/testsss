import { z } from "zod";
import { prisma } from "@/lib/db";
import { gradeMappingSchema, type GradeMapping } from "@/lib/schemas";
import { gradeTable } from "@/lib/grading";
import { parseJson, toJson } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const gradeScaleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  totalPoints: z.coerce.number().min(1).max(1000).default(100),
  sufficiencyThreshold: z.coerce.number().min(1).max(1000).default(60),
  mapping: gradeMappingSchema.default({ mode: "lineare" }),
  isDefault: z.boolean().default(false),
});

export type GradeScaleInput = z.infer<typeof gradeScaleSchema>;

export type GradeScaleRow = Prisma.GradeScaleGetPayload<{ include: { _count: { select: { tests: true } } } }>;

export function serializeGradeScale(row: GradeScaleRow) {
  return {
    id: row.id,
    name: row.name,
    totalPoints: row.totalPoints,
    sufficiencyThreshold: row.sufficiencyThreshold,
    mapping: parseJson<GradeMapping>(row.mappingJson, { mode: "lineare" }),
    isDefault: row.isDefault,
    testsCount: row._count.tests,
  };
}

export async function listGradeScales() {
  const rows = await prisma.gradeScale.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { tests: true } } },
  });
  return rows.map(serializeGradeScale);
}

export async function createGradeScale(input: GradeScaleInput) {
  if (input.sufficiencyThreshold > input.totalPoints) {
    throw new Error("La soglia di sufficienza non può superare il punteggio totale.");
  }
  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.gradeScale.updateMany({ data: { isDefault: false } });
    return tx.gradeScale.create({
      data: {
        name: input.name,
        totalPoints: input.totalPoints,
        sufficiencyThreshold: input.sufficiencyThreshold,
        mappingJson: toJson(input.mapping),
        isDefault: input.isDefault,
      },
      include: { _count: { select: { tests: true } } },
    });
  });
  return serializeGradeScale(row);
}

export async function updateGradeScale(id: string, input: GradeScaleInput) {
  const existing = await prisma.gradeScale.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error("Scala di conversione non trovata.");
  if (input.sufficiencyThreshold > input.totalPoints) {
    throw new Error("La soglia di sufficienza non può superare il punteggio totale.");
  }
  const row = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.gradeScale.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    }
    return tx.gradeScale.update({
      where: { id },
      data: {
        name: input.name,
        totalPoints: input.totalPoints,
        sufficiencyThreshold: input.sufficiencyThreshold,
        mappingJson: toJson(input.mapping),
        isDefault: input.isDefault,
      },
      include: { _count: { select: { tests: true } } },
    });
  });
  return serializeGradeScale(row);
}

export async function deleteGradeScale(id: string) {
  const scale = await prisma.gradeScale.findUnique({
    where: { id },
    select: { id: true, isDefault: true, _count: { select: { tests: true } } },
  });
  if (!scale) throw new Error("Scala di conversione non trovata.");
  if (scale.isDefault) throw new Error("La scala predefinita non può essere eliminata.");
  if (scale._count.tests > 0) {
    throw new Error("La scala è usata da alcune verifiche: modificala o assegna loro un'altra scala.");
  }
  await prisma.gradeScale.delete({ where: { id } });
}

/** Restituisce la scala predefinita o ne crea una lineare 100/60. */
export async function ensureDefaultGradeScale() {
  const existing = await prisma.gradeScale.findFirst({ where: { isDefault: true } });
  if (existing) return existing;
  return prisma.gradeScale.create({
    data: {
      name: "Scala dipartimento (100 punti)",
      totalPoints: 100,
      sufficiencyThreshold: 60,
      mappingJson: toJson({ mode: "lineare" }),
      isDefault: true,
    },
  });
}

export function gradePreview(input: {
  totalPoints: number;
  sufficiencyThreshold: number;
  mapping: GradeMapping;
}) {
  const rows = gradeTable(input.totalPoints, input.sufficiencyThreshold, input.mapping);
  return rows;
}
