import { NextResponse } from "next/server";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { generationRequestSchema } from "@/lib/schemas";
import { generateTests, GenerationError } from "@/lib/generation/service";
import { errorMessage } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    const result = await generateTests({ request: parsed.data, user: guarded.user });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GenerationError) {
      return jsonError(error.message, 422, {
        issues: error.errors,
        warnings: error.warnings,
        keepWizardData: true,
      });
    }
    return jsonError(
      errorMessage(error, "La generazione non è riuscita. I dati del wizard sono conservati."),
      500,
      { keepWizardData: true },
    );
  }
}
