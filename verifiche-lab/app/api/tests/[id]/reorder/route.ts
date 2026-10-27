import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { reorderItems } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) });

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const test = await reorderItems(id, parsed.data.orderedIds, guarded.user);
    return NextResponse.json({ test });
  } catch (error) {
    return routeError(error);
  }
}
