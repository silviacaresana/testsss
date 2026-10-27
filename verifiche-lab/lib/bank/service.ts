import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { parseJson, toJson } from "@/lib/utils";

export interface BankEntryRow {
  id: string;
  itemSnapshotJson: string;
  visibility: string;
  rating: number;
  ratingCount: number;
  tagsJson: string;
  notes: string;
  usageCount: number;
  ownerId: string;
  owner: { name: string };
  sourceTestId: string | null;
  createdAt: Date;
}

export interface SerializedBankEntry {
  id: string;
  ownerId: string;
  ownerName: string;
  prompt: string;
  type: string;
  points: number;
  difficulty: number;
  estimatedMin: number;
  options: string[];
  correctOption: number | null;
  solutionSteps: string[];
  gradingCriteria: string[];
  topicId: string | null;
  tags: string[];
  visibility: string;
  notes: string;
  rating: number;
  ratingCount: number;
  usageCount: number;
  sourceTestId: string | null;
  createdAt: string;
  canEdit: boolean;
}

export function serializeBankEntry(row: BankEntryRow, user?: Pick<SessionUser, "id" | "role">): SerializedBankEntry {
  const snapshot = parseJson<Record<string, unknown>>(row.itemSnapshotJson, {});
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    prompt: String(snapshot.prompt ?? ""),
    type: String(snapshot.type ?? "exercise"),
    points: Number(snapshot.points ?? 0),
    difficulty: Number(snapshot.difficulty ?? 3),
    estimatedMin: Number(snapshot.estimatedMin ?? 0),
    options: Array.isArray(snapshot.options) ? snapshot.options.map(String) : [],
    correctOption: typeof snapshot.correctOption === "number" ? snapshot.correctOption : null,
    solutionSteps: Array.isArray(snapshot.solutionSteps) ? snapshot.solutionSteps.map(String) : [],
    gradingCriteria: Array.isArray(snapshot.gradingCriteria) ? snapshot.gradingCriteria.map(String) : [],
    topicId: typeof snapshot.topicId === "string" ? snapshot.topicId : null,
    tags: parseJson<string[]>(row.tagsJson, []),
    visibility: row.visibility,
    notes: row.notes,
    rating: row.rating,
    ratingCount: row.ratingCount,
    usageCount: row.usageCount,
    sourceTestId: row.sourceTestId,
    createdAt: row.createdAt.toISOString(),
    canEdit: !user ? true : user.role === "admin" || row.ownerId === user.id,
  };
}

export function bankAccessFilter(user: Pick<SessionUser, "id" | "role">): Prisma.ItemBankEntryWhereInput {
  if (user.role === "admin") return {};
  return { OR: [{ visibility: { not: "privato" } }, { ownerId: user.id }] };
}

export async function listTags(): Promise<string[]> {
  const rows = await prisma.itemBankEntry.findMany({ select: { tagsJson: true } });
  const tags = new Set<string>();
  for (const row of rows) {
    for (const value of parseJson<string[]>(row.tagsJson, [])) tags.add(value);
  }
  return [...tags].sort((a, b) => a.localeCompare(b, "it"));
}

export async function recordBankUsage(entryId: string): Promise<void> {
  await prisma.itemBankEntry
    .update({ where: { id: entryId }, data: { usageCount: { increment: 1 } } })
    .catch(() => undefined);
}

export async function rateBankEntry(
  entryId: string,
  user: Pick<SessionUser, "id" | "role">,
  rating: number,
): Promise<SerializedBankEntry> {
  const entry = await prisma.itemBankEntry.findUnique({
    where: { id: entryId },
    include: { owner: { select: { name: true } } },
  });
  if (!entry) throw new Error("Quesito della banca non trovato.");
  if (entry.visibility === "privato" && entry.ownerId !== user.id && user.role !== "admin") {
    throw new Error("Questo quesito è privato.");
  }
  const nextCount = entry.ratingCount + 1;
  const nextRating = (entry.rating * entry.ratingCount + rating) / nextCount;
  const updated = await prisma.itemBankEntry.update({
    where: { id: entryId },
    data: { rating: Math.round(nextRating * 100) / 100, ratingCount: nextCount },
    include: { owner: { select: { name: true } } },
  });
  return serializeBankEntry(updated, user);
}

export async function updateBankEntry(
  entryId: string,
  user: Pick<SessionUser, "id" | "role">,
  data: { visibility?: string; notes?: string; tags?: string[] },
): Promise<SerializedBankEntry> {
  const entry = await prisma.itemBankEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error("Quesito della banca non trovato.");
  if (entry.ownerId !== user.id && user.role !== "admin") {
    throw new Error("Solo il proprietario può modificare questo quesito.");
  }
  const updated = await prisma.itemBankEntry.update({
    where: { id: entryId },
    data: {
      ...(data.visibility ? { visibility: data.visibility } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.tags ? { tagsJson: toJson(data.tags) } : {}),
    },
    include: { owner: { select: { name: true } } },
  });
  return serializeBankEntry(updated, user);
}

export async function deleteBankEntry(
  entryId: string,
  user: Pick<SessionUser, "id" | "role">,
): Promise<void> {
  const entry = await prisma.itemBankEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error("Quesito della banca non trovato.");
  if (entry.ownerId !== user.id && user.role !== "admin") {
    throw new Error("Solo il proprietario può eliminare questo quesito.");
  }
  await prisma.itemBankEntry.delete({ where: { id: entryId } });
}
