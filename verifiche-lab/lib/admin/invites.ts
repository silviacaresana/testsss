import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida.").max(160),
  role: z.enum(["admin", "teacher"]).default("teacher"),
});

export async function createInvite(input: z.infer<typeof inviteSchema>, createdById: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new Error("Esiste già un account con questa email.");

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.invite.deleteMany({ where: { email: input.email, usedAt: null } });
  const invite = await prisma.invite.create({
    data: {
      email: input.email,
      role: input.role,
      token: hashToken(rawToken),
      expiresAt,
      createdById,
    },
    include: { createdBy: { select: { name: true } } },
  });

  return {
    invite: serializeInvite(invite),
    token: rawToken,
    linkPath: `/invito/${rawToken}`,
  };
}

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  createdBy: { name: string };
};

export function serializeInvite(row: InviteRow) {
  const now = Date.now();
  const expired = row.expiresAt.getTime() < now;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt ? row.usedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy.name,
    status: row.usedAt ? "usato" : expired ? "scaduto" : "attivo",
  };
}

export async function listInvites() {
  const rows = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map(serializeInvite);
}

export async function revokeInvite(id: string) {
  const invite = await prisma.invite.findUnique({ where: { id }, select: { usedAt: true } });
  if (!invite) throw new Error("Invito non trovato.");
  if (invite.usedAt) throw new Error("L'invito è già stato utilizzato.");
  await prisma.invite.delete({ where: { id } });
}

export async function getInviteByToken(rawToken: string) {
  if (!rawToken || rawToken.length < 20) return null;
  const invite = await prisma.invite.findUnique({
    where: { token: hashToken(rawToken) },
    include: { createdBy: { select: { name: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
  subjects: ("matematica" | "fisica")[];
  tracks: ("classico" | "scientifico")[];
}) {
  const invite = await getInviteByToken(input.token);
  if (!invite) throw new Error("Invito non valido, scaduto o già utilizzato.");

  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: invite.email,
        name: input.name,
        role: invite.role,
        passwordHash,
        subjects: JSON.stringify(input.subjects),
        tracks: JSON.stringify(input.tracks),
      },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    return user;
  });
}
