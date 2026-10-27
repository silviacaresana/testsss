import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { getCurrentUser, CSRF_COOKIE, csrfCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessione scaduta." }, { status: 401 });
  const store = await cookies();
  const existing = store.get(CSRF_COOKIE)?.value;
  const token = existing || randomUUID();
  const response = NextResponse.json({ token });
  if (!existing) response.cookies.set(csrfCookie(token));
  return response;
}
