import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

/**
 * Programmi del dipartimento: in questa versione sono solo in lettura.
 *
 * I programmi sono quelli dimostrativi creati da `lib/bootstrap.ts`; l'editor dei programmi non c'è più.
 * Le funzioni di creazione, modifica, pubblicazione e versionamento sono state rimosse perché nessuna
 * pagina o API le chiamava e usavano transazioni, che D1 non supporta.
 */

const include = {
  topics: {
    include: { objectives: { orderBy: { code: "asc" as const } } },
    orderBy: { order: "asc" as const },
  },
  author: { select: { name: true } },
  _count: { select: { tests: true } },
} satisfies Prisma.CurriculumInclude;

type CurriculumRow = Prisma.CurriculumGetPayload<{ include: typeof include }>;

export function serializeCurriculum(row: CurriculumRow) {
  return {
    id: row.id,
    track: row.track,
    year: row.year,
    subject: row.subject,
    version: row.version,
    status: row.status,
    title: row.title,
    notes: row.notes,
    authorId: row.authorId,
    authorName: row.author.name,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    testsCount: row._count.tests,
    topics: row.topics.map((topic) => ({
      id: topic.id,
      code: topic.code,
      name: topic.name,
      description: topic.description,
      weightHint: topic.weightHint,
      difficultyMin: topic.difficultyMin,
      difficultyMax: topic.difficultyMax,
      isCore: topic.isCore,
      order: topic.order,
      objectives: topic.objectives.map((objective) => ({
        id: objective.id,
        code: objective.code,
        text: objective.text,
        prerequisites: parseList(objective.prerequisites),
        keywords: parseList(objective.keywords),
      })),
    })),
  };
}

function parseList(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function canEditCurriculum(
  user: Pick<SessionUser, "id" | "role">,
  curriculum: { authorId: string; status: string },
): boolean {
  if (user.role === "admin") return true;
  if (curriculum.authorId !== user.id) return false;
  return curriculum.status !== "pubblicato";
}

export async function listCurricula(user: SessionUser, filters: {
  track?: string;
  year?: number;
  subject?: string;
  status?: string;
}) {
  const where: Prisma.CurriculumWhereInput = {};
  if (filters.track) where.track = filters.track;
  if (filters.subject) where.subject = filters.subject;
  if (filters.year && filters.year >= 1 && filters.year <= 5) where.year = filters.year;
  if (filters.status) where.status = filters.status;

  const rows = await prisma.curriculum.findMany({
    where,
    include,
    orderBy: [{ track: "asc" }, { year: "asc" }, { subject: "asc" }, { version: "desc" }],
  });
  return rows.map((row) => ({
    ...serializeCurriculum(row),
    canEdit: canEditCurriculum(user, row),
  }));
}
