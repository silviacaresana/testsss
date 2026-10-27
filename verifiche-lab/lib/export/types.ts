import type { Prisma } from "@prisma/client";

/** Test completo richiesto per generare i documenti LaTeX. */
export type TestForExport = Prisma.TestGetPayload<{
  include: {
    items: { include: { topic: true } };
    sections: true;
    rubric: true;
    gradeScale: true;
    author: { select: { name: true } };
    curriculum: true;
  };
}>;
