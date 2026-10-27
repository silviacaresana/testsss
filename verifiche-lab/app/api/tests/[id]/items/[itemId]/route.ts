import { NextResponse } from "next/server";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { deleteItem, updateItem } from "@/lib/generation/service";
import { itemPatchSchema } from "@/lib/schemas";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id, itemId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = itemPatchSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const result = await updateItem(id, itemId, guarded.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id, itemId } = await params;
  try {
    const test = await deleteItem(id, itemId, guarded.user);
    return NextResponse.json({ test });
  } catch (error) {
    return routeError(error);
  }
}
