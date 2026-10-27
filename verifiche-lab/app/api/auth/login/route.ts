import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/schemas";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  csrfCookie,
  sessionCookie,
} from "@/lib/auth/session";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { audit, jsonError, zodError } from "@/lib/api";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "locale";
  const key = `${ip}|${parsed.data.email.toLowerCase()}`;
  const limit = rateLimit(key, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return jsonError(
      `Troppi tentativi di accesso. Riprova tra ${Math.ceil(limit.retryAfterSec / 60)} minuti.`,
      429,
    );
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const valid = user ? await verifyPassword(user.passwordHash, parsed.data.password) : false;
  if (!user || !valid) {
    return jsonError("Email o password non corretti.", 401);
  }

  resetRateLimit(key);
  const session = await createSession(user.id);
  const csrf = randomUUID();
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    csrfToken: csrf,
  });
  response.cookies.set(sessionCookie(session.token, session.expiresAt));
  response.cookies.set(csrfCookie(csrf));
  await audit(user.id, "login", "User", user.id, {});
  return response;
}
