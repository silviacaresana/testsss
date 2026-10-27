import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { saveItemToBank } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const schema = z.object({
  visibility: z.enum(["privato", "dipartimento", "pubblico interno"]).default("dipartimento"),
  tags: z.array(z.string().max(40)).max(15).default([]),
  notes: z.string().max(500).default(""),
});

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id, itemId } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const entry = await saveItemToBank(id, itemId, guarded.user, parsed.data);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
