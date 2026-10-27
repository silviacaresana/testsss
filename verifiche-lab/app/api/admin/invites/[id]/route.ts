import { NextResponse } from "next/server";
import { audit, guardApi, jsonError } from "@/lib/api";
import { revokeInvite } from "@/lib/admin/invites";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    await revokeInvite(id);
    await audit(guarded.user.id, "revoca-invito", "Invite", id, {});
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Revoca non riuscita.", 400);
  }
}
