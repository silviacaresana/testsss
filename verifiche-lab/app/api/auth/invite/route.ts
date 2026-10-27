import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { audit, jsonError, zodError } from "@/lib/api";
import { acceptInvite } from "@/lib/admin/invites";
import { rateLimit } from "@/lib/auth/rate-limit";
import { createSession, csrfCookie, sessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(10, "La password deve avere almeno 10 caratteri.").max(200),
  subjects: z.array(z.enum(["matematica", "fisica"])).default([]),
  tracks: z.array(z.enum(["classico", "scientifico"])).default([]),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "locale";
  const limit = rateLimit(`invito|${ip}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("Troppi tentativi. Riprova più tardi.", 429);
  }

  try {
    const user = await acceptInvite(parsed.data);
    const session = await createSession(user.id);
    const csrf = randomUUID();
    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    response.cookies.set(csrfCookie(csrf));
    await audit(user.id, "accettazione-invito", "User", user.id, {});
    return response;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Attivazione non riuscita.", 400);
  }
}
