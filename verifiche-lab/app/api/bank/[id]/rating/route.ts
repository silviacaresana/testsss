import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { rateBankEntry } from "@/lib/bank/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ rating: z.coerce.number().int().min(1).max(5) });

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  const { id } = await params;
  try {
    const entry = await rateBankEntry(id, guarded.user, parsed.data.rating);
    return NextResponse.json({ entry });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Valutazione non riuscita.", 400);
  }
}
