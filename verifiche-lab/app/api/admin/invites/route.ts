import { NextResponse } from "next/server";
import { audit, guardApi, jsonError, zodError } from "@/lib/api";
import { createInvite, inviteSchema, listInvites } from "@/lib/admin/invites";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { admin: true, csrf: false });
  if ("response" in guarded) return guarded.response;
  const invites = await listInvites();
  return NextResponse.json({ invites });
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
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const result = await createInvite(parsed.data, guarded.user.id);
    await audit(guarded.user.id, "invito", "Invite", result.invite.id, {
      email: result.invite.email,
      role: result.invite.role,
    });
    const origin = new URL(request.url).origin;
    return NextResponse.json(
      { invite: result.invite, link: `${origin}${result.linkPath}` },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Creazione dell'invito non riuscita.", 400);
  }
}
