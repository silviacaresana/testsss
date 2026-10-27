import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { parseJson, toJson } from "@/lib/utils";

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida.").max(160),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["admin", "teacher"]).default("teacher"),
  password: z.string().min(10, "La password deve avere almeno 10 caratteri.").max(200),
  subjects: z.array(z.enum(["matematica", "fisica"])).default([]),
  tracks: z.array(z.enum(["classico", "scientifico"])).default([]),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["admin", "teacher"]).optional(),
  password: z.string().min(10, "La password deve avere almeno 10 caratteri.").max(200).optional(),
  subjects: z.array(z.enum(["matematica", "fisica"])).optional(),
  tracks: z.array(z.enum(["classico", "scientifico"])).optional(),
});

const userInclude = {
  _count: { select: { tests: true, curricula: true, bankEntries: true } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export function serializeUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    subjects: parseJson<string[]>(row.subjects, []),
    tracks: parseJson<string[]>(row.tracks, []),
    lastLogin: row.lastLogin ? row.lastLogin.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    testsCount: row._count.tests,
    curriculaCount: row._count.curricula,
    bankCount: row._count.bankEntries,
  };
}

export async function listUsers() {
  const rows = await prisma.user.findMany({ include: userInclude, orderBy: [{ role: "asc" }, { name: "asc" }] });
  return rows.map(serializeUser);
}

export async function createUser(input: z.infer<typeof userCreateSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new Error("Esiste già un account con questa email.");
  const row = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      subjects: toJson(input.subjects),
      tracks: toJson(input.tracks),
    },
    include: userInclude,
  });
  return serializeUser(row);
}

export async function updateUser(id: string, input: z.infer<typeof userUpdateSchema>) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("Docente non trovato.");

  if (input.role && input.role !== "admin" && existing.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins <= 1) throw new Error("Deve restare almeno un amministratore.");
  }

  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.subjects ? { subjects: toJson(input.subjects) } : {}),
      ...(input.tracks ? { tracks: toJson(input.tracks) } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
    include: userInclude,
  });

  if (input.password) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  return serializeUser(row);
}

export async function deleteUser(id: string, actingUserId: string) {
  if (id === actingUserId) throw new Error("Non puoi eliminare il tuo stesso account.");
  const existing = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { tests: true, curricula: true, bankEntries: true } } },
  });
  if (!existing) throw new Error("Docente non trovato.");
  if (existing.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins <= 1) throw new Error("Deve restare almeno un amministratore.");
  }
  if (existing._count.tests + existing._count.curricula + existing._count.bankEntries > 0) {
    throw new Error(
      "L'account ha verifiche, programmi o quesiti associati: non può essere eliminato. Puoi cambiargli il ruolo o la password.",
    );
  }
  await prisma.user.delete({ where: { id } });
}
