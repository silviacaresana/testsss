import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, guardApi, parseIssues, zodError } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { toJson } from "@/lib/utils";

export const runtime = "nodejs";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Il nome deve avere almeno 2 caratteri").max(80),
  subjects: z.array(z.enum(["matematica", "fisica"])).default([]),
  tracks: z.array(z.enum(["classico", "scientifico"])).default([]),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "La nuova password deve avere almeno 8 caratteri").optional(),
});

export async function PATCH(request: Request) {
  const guard = await guardApi(request);
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const user = await prisma.user.findUnique({ where: { id: guard.user.id } });
  if (!user) return NextResponse.json({ error: "Utente non trovato." }, { status: 404 });

  const data: {
    name: string;
    subjects: string;
    tracks: string;
    passwordHash?: string;
  } = {
    name: parsed.data.name,
    subjects: toJson(parsed.data.subjects),
    tracks: toJson(parsed.data.tracks),
  };

  if (parsed.data.newPassword) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: "Inserisci la password attuale per cambiarla." }, { status: 400 });
    }
    const valid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
    if (!valid) return NextResponse.json({ error: "La password attuale non è corretta." }, { status: 400 });
    data.passwordHash = await hashPassword(parsed.data.newPassword);
  }

  try {
    await prisma.user.update({ where: { id: user.id }, data });
  } catch (error) {
    return NextResponse.json({ error: parseIssues(error).join(" ") }, { status: 400 });
  }
  await audit(user.id, "profilo", "User", user.id, { passwordChanged: Boolean(data.passwordHash) });
  return NextResponse.json({ ok: true });
}
