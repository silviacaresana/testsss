import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { createVariantFromRequest } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ label: z.enum(["A", "B", "C", "D"]).default("B") });

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const test = await createVariantFromRequest(id, guarded.user, parsed.data.label);
    return NextResponse.json({ test }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
