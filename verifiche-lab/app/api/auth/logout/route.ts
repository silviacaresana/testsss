import { NextResponse } from "next/server";
import { audit, guardApi } from "@/lib/api";
import {
  clearedSessionCookie,
  clearedCsrfCookie,
  destroySession,
  SESSION_COOKIE,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardApi(request);
  if ("response" in guard) return guard.response;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  await destroySession(token);
  await audit(guard.user.id, "logout", "User", guard.user.id, {});

  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedSessionCookie());
  response.cookies.set(clearedCsrfCookie());
  return response;
}
