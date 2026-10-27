import { NextResponse } from "next/server";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { rubricUpdateSchema, updateRubric } from "@/lib/tests/rubric";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = rubricUpdateSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const test = await updateRubric(id, guarded.user, parsed.data);
    return NextResponse.json({ test });
  } catch (error) {
    return routeError(error);
  }
}
