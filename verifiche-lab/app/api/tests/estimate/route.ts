import { NextResponse } from "next/server";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { generationRequestSchema } from "@/lib/schemas";
import { estimateGeneration, GenerationError } from "@/lib/generation/service";
import { errorMessage } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = generationRequestSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const estimate = await estimateGeneration(guarded.user, parsed.data);
    return NextResponse.json(estimate);
  } catch (error) {
    if (error instanceof GenerationError) return jsonError(error.message, 409, { issues: error.errors });
    return jsonError(errorMessage(error, "Impossibile stimare la generazione."), 500);
  }
}
