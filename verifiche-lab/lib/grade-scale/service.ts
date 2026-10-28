import { prisma } from "@/lib/db";
import type { GradeMapping } from "@/lib/schemas";
import { parseJson } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/**
 * Scale di conversione dei voti: in questa versione sono solo in lettura.
 *
 * Le scale sono quelle create da `lib/bootstrap.ts`. Le funzioni di creazione, modifica ed eliminazione
 * sono state rimosse perché nessuna pagina o API le chiamava e usavano transazioni, che D1 non supporta.
 */

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
