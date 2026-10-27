import { z } from "zod";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

export const objectiveInputSchema = z.object({
  code: z.string().trim().min(1).max(20),
  text: z.string().trim().min(3).max(500),
  prerequisites: z.array(z.string().trim().max(80)).max(10).default([]),
  keywords: z.array(z.string().trim().max(60)).max(12).default([]),
});

export const topicInputSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(600).default(""),
  weightHint: z.coerce.number().int().min(0).max(100).default(10),
  difficultyMin: z.coerce.number().int().min(1).max(5).default(1),
  difficultyMax: z.coerce.number().int().min(1).max(5).default(3),
  isCore: z.boolean().default(true),
  objectives: z.array(objectiveInputSchema).max(40).default([]),
});

export const curriculumInputSchema = z.object({
  track: z.enum(["classico", "scientifico"]),
  year: z.coerce.number().int().min(1).max(5),
  subject: z.enum(["matematica", "fisica"]),
  title: z.string().trim().min(3).max(160),
  notes: z.string().max(2000).optional().default(""),
  topics: z.array(topicInputSchema).max(60).default([]),
});

export type CurriculumInput = z.infer<typeof curriculumInputSchema>;

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

function jsonList(values: string[]): string {
  return JSON.stringify(values);
}

export function canEditCurriculum(
  user: Pick<SessionUser, "id" | "role">,
  curriculum: { authorId: string; status: string },
): boolean {
  if (user.role === "admin") return true;
  if (curriculum.authorId !== user.id) return false;
  return curriculum.status !== "pubblicato";
}

async function nextVersion(track: string, year: number, subject: string): Promise<number> {
  const latest = await prisma.curriculum.findFirst({
    where: { track, year, subject },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

async function writeTopics(
  tx: Prisma.TransactionClient,
  curriculumId: string,
  topics: CurriculumInput["topics"],
): Promise<void> {
  await tx.topic.deleteMany({ where: { curriculumId } });
  for (let index = 0; index < topics.length; index++) {
    const topic = topics[index];
    const created = await tx.topic.create({
      data: {
        curriculumId,
        code: topic.code,
        name: topic.name,
        description: topic.description || "",
        weightHint: topic.weightHint,
        difficultyMin: Math.min(topic.difficultyMin, topic.difficultyMax),
        difficultyMax: Math.max(topic.difficultyMin, topic.difficultyMax),
        isCore: topic.isCore,
        order: index,
      },
    });
    const used = new Set<string>();
    for (const objective of topic.objectives) {
      let code = objective.code;
      let suffix = 2;
      while (used.has(code)) code = `${objective.code}.${suffix++}`;
      used.add(code);
      await tx.learningObjective.create({
        data: {
          topicId: created.id,
          code,
          text: objective.text,
          prerequisites: jsonList(objective.prerequisites),
          keywords: jsonList(objective.keywords),
        },
      });
    }
  }
}

export async function createCurriculum(input: CurriculumInput, user: SessionUser) {
  const version = await nextVersion(input.track, input.year, input.subject);
  const created = await prisma.$transaction(async (tx) => {
    const curriculum = await tx.curriculum.create({
      data: {
        track: input.track,
        year: input.year,
        subject: input.subject,
        version,
        status: "bozza",
        title: input.title,
        notes: input.notes ?? "",
        authorId: user.id,
      },
    });
    await writeTopics(tx, curriculum.id, input.topics);
    return curriculum;
  });
  await audit(user.id, "creazione", "Curriculum", created.id, {
    track: input.track,
    year: input.year,
    subject: input.subject,
    topics: input.topics.length,
  });
  return getCurriculum(created.id);
}

export async function updateCurriculum(id: string, input: CurriculumInput, user: SessionUser) {
  const existing = await prisma.curriculum.findUnique({ where: { id } });
  if (!existing) throw new Error("Programma non trovato.");
  if (!canEditCurriculum(user, existing)) {
    throw new Error(
      existing.status === "pubblicato"
        ? "Il programma è pubblicato: crea una nuova versione per modificarlo."
        : "Non hai i permessi per modificare questo programma.",
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.curriculum.update({
      where: { id },
      data: {
        title: input.title,
        notes: input.notes ?? "",
        track: input.track,
        year: input.year,
        subject: input.subject,
      },
    });
    await writeTopics(tx, id, input.topics);
  });
  await audit(user.id, "modifica", "Curriculum", id, { topics: input.topics.length });
  return getCurriculum(id);
}

export async function getCurriculum(id: string) {
  const row = await prisma.curriculum.findUnique({ where: { id }, include });
  if (!row) throw new Error("Programma non trovato.");
  return serializeCurriculum(row);
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

export async function publishCurriculum(id: string, user: SessionUser) {
  const row = await prisma.curriculum.findUnique({ where: { id }, include });
  if (!row) throw new Error("Programma non trovato.");
  if (row.authorId !== user.id && user.role !== "admin") {
    throw new Error("Solo l'autore o un amministratore può pubblicare il programma.");
  }
  if (row.topics.length === 0) throw new Error("Aggiungi almeno un argomento prima di pubblicare.");
  if (row.topics.every((topic) => topic.objectives.length === 0)) {
    throw new Error("Aggiungi almeno un obiettivo prima di pubblicare.");
  }
  await prisma.$transaction([
    prisma.curriculum.update({ where: { id }, data: { status: "pubblicato", publishedAt: new Date() } }),
    prisma.curriculum.updateMany({
      where: {
        track: row.track,
        year: row.year,
        subject: row.subject,
        id: { not: id },
        status: "pubblicato",
      },
      data: { status: "archiviato" },
    }),
  ]);
  await audit(user.id, "pubblicazione", "Curriculum", id, { version: row.version });
  return getCurriculum(id);
}

export async function archiveCurriculum(id: string, user: SessionUser) {
  const row = await prisma.curriculum.findUnique({ where: { id } });
  if (!row) throw new Error("Programma non trovato.");
  if (row.authorId !== user.id && user.role !== "admin") {
    throw new Error("Non hai i permessi per archiviare questo programma.");
  }
  await prisma.curriculum.update({ where: { id }, data: { status: "archiviato" } });
  await audit(user.id, "archiviazione", "Curriculum", id, {});
  return getCurriculum(id);
}

export async function newCurriculumVersion(id: string, user: SessionUser) {
  const row = await prisma.curriculum.findUnique({ where: { id }, include });
  if (!row) throw new Error("Programma non trovato.");
  if (row.authorId !== user.id && user.role !== "admin") {
    throw new Error("Non hai i permessi per creare una nuova versione.");
  }
  const version = await nextVersion(row.track, row.year, row.subject);
  const created = await prisma.$transaction(async (tx) => {
    const copy = await tx.curriculum.create({
      data: {
        track: row.track,
        year: row.year,
        subject: row.subject,
        version,
        status: "bozza",
        title: row.title,
        notes: row.notes,
        authorId: user.id,
      },
    });
    for (const topic of row.topics) {
      const newTopic = await tx.topic.create({
        data: {
          curriculumId: copy.id,
          code: topic.code,
          name: topic.name,
          description: topic.description,
          weightHint: topic.weightHint,
          difficultyMin: topic.difficultyMin,
          difficultyMax: topic.difficultyMax,
          isCore: topic.isCore,
          order: topic.order,
        },
      });
      for (const objective of topic.objectives) {
        await tx.learningObjective.create({
          data: {
            topicId: newTopic.id,
            code: objective.code,
            text: objective.text,
            prerequisites: objective.prerequisites,
            keywords: objective.keywords,
          },
        });
      }
    }
    return copy;
  });
  await audit(user.id, "nuova-versione", "Curriculum", created.id, { from: id, version });
  return getCurriculum(created.id);
}

export async function deleteCurriculum(id: string, user: SessionUser) {
  const row = await prisma.curriculum.findUnique({ where: { id } });
  if (!row) throw new Error("Programma non trovato.");
  if (row.authorId !== user.id && user.role !== "admin") {
    throw new Error("Non hai i permessi per eliminare questo programma.");
  }
  if (row.status === "pubblicato" && user.role !== "admin") {
    throw new Error("Il programma è pubblicato: archivialo oppure chiedi a un amministratore.");
  }
  await prisma.curriculum.delete({ where: { id } });
  await audit(user.id, "eliminazione", "Curriculum", id, { title: row.title });
}

export interface CurriculumDiff {
  from: { id: string; version: number; title: string };
  to: { id: string; version: number; title: string };
  topicsAdded: { code: string; name: string }[];
  topicsRemoved: { code: string; name: string }[];
  topicsChanged: { code: string; name: string; changes: string[] }[];
  objectivesAdded: { topic: string; code: string; text: string }[];
  objectivesRemoved: { topic: string; code: string; text: string }[];
}

export async function diffCurricula(fromId: string, toId: string): Promise<CurriculumDiff> {
  const [from, to] = await Promise.all([
    prisma.curriculum.findUnique({ where: { id: fromId }, include }),
    prisma.curriculum.findUnique({ where: { id: toId }, include }),
  ]);
  if (!from || !to) throw new Error("Programma non trovato.");
  const fromTopics = new Map(from.topics.map((topic) => [topic.code, topic]));
  const toTopics = new Map(to.topics.map((topic) => [topic.code, topic]));

  const topicsAdded = [...toTopics.values()]
    .filter((topic) => !fromTopics.has(topic.code))
    .map((topic) => ({ code: topic.code, name: topic.name }));
  const topicsRemoved = [...fromTopics.values()]
    .filter((topic) => !toTopics.has(topic.code))
    .map((topic) => ({ code: topic.code, name: topic.name }));
  const topicsChanged: CurriculumDiff["topicsChanged"] = [];
  const objectivesAdded: CurriculumDiff["objectivesAdded"] = [];
  const objectivesRemoved: CurriculumDiff["objectivesRemoved"] = [];

  for (const [code, before] of fromTopics) {
    const after = toTopics.get(code);
    if (!after) continue;
    const changes: string[] = [];
    if (before.name !== after.name) changes.push(`nome: «${before.name}» → «${after.name}»`);
    if (before.description !== after.description) changes.push("descrizione modificata");
    if (before.weightHint !== after.weightHint) changes.push(`peso: ${before.weightHint}% → ${after.weightHint}%`);
    if (before.difficultyMin !== after.difficultyMin || before.difficultyMax !== after.difficultyMax) {
      changes.push(`difficoltà: ${before.difficultyMin}-${before.difficultyMax} → ${after.difficultyMin}-${after.difficultyMax}`);
    }
    if (changes.length > 0) topicsChanged.push({ code, name: after.name, changes });

    const beforeObjectives = new Map(before.objectives.map((objective) => [objective.code, objective]));
    const afterObjectives = new Map(after.objectives.map((objective) => [objective.code, objective]));
    for (const [objectiveCode, objective] of afterObjectives) {
      if (!beforeObjectives.has(objectiveCode)) {
        objectivesAdded.push({ topic: code, code: objectiveCode, text: objective.text });
      }
    }
    for (const [objectiveCode, objective] of beforeObjectives) {
      if (!afterObjectives.has(objectiveCode)) {
        objectivesRemoved.push({ topic: code, code: objectiveCode, text: objective.text });
      }
    }
  }

  return {
    from: { id: from.id, version: from.version, title: from.title },
    to: { id: to.id, version: to.version, title: to.title },
    topicsAdded,
    topicsRemoved,
    topicsChanged,
    objectivesAdded,
    objectivesRemoved,
  };
}

async function audit(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown>,
) {
  await prisma.auditLog
    .create({ data: { userId, action, entity, entityId, metaJson: JSON.stringify(meta) } })
    .catch(() => undefined);
}
