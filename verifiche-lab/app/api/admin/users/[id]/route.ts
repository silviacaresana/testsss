import { NextResponse } from "next/server";
import { audit, guardApi, jsonError, zodError } from "@/lib/api";
import { deleteUser, updateUser, userUpdateSchema } from "@/lib/admin/users";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  const parsed = userUpdateSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  const { id } = await params;
  try {
    const user = await updateUser(id, parsed.data);
    await audit(guarded.user.id, "modifica", "User", id, {
      role: user.role,
      passwordReimpostata: Boolean(parsed.data.password),
    });
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Modifica non riuscita.", 400);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    await deleteUser(id, guarded.user.id);
    await audit(guarded.user.id, "eliminazione", "User", id, {});
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Eliminazione non riuscita.", 400);
  }
}
