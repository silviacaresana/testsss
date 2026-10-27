import { NextResponse } from "next/server";
import { audit, guardApi, jsonError, zodError } from "@/lib/api";
import { createUser, listUsers, userCreateSchema } from "@/lib/admin/users";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { admin: true, csrf: false });
  if ("response" in guarded) return guarded.response;
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  const parsed = userCreateSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const user = await createUser(parsed.data);
    await audit(guarded.user.id, "creazione", "User", user.id, { email: user.email, role: user.role });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Creazione non riuscita.", 400);
  }
}
