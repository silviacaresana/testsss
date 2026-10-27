import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { rebalanceTest } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ target: z.number().min(1).max(200).optional() });

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
    const result = await rebalanceTest(id, guarded.user, parsed.data.target);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
