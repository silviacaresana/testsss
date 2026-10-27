import { NextResponse } from "next/server";
import { audit, guardApi, jsonError, zodError } from "@/lib/api";
import {
  createGradeScale,
  gradePreview,
  gradeScaleSchema,
  listGradeScales,
} from "@/lib/grade-scale/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;

  const [scales] = await Promise.all([listGradeScales()]);
  return NextResponse.json({ scales });
}

export async function POST(request: Request) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  const parsed = gradeScaleSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const scale = await createGradeScale(parsed.data);
    await audit(guarded.user.id, "creazione", "GradeScale", scale.id, { name: scale.name });
    return NextResponse.json(
      { scale, preview: gradePreview({ ...parsed.data, mapping: parsed.data.mapping }) },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Creazione non riuscita.", 400);
  }
}
