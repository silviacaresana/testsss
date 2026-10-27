import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { deleteBankEntry, updateBankEntry } from "@/lib/bank/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  visibility: z.enum(["privato", "dipartimento", "pubblico interno"]).optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  const { id } = await params;
  try {
    const entry = await updateBankEntry(id, guarded.user, parsed.data);
    return NextResponse.json({ entry });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Modifica non riuscita.", 400);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    await deleteBankEntry(id, guarded.user);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Eliminazione non riuscita.", 400);
  }
}
