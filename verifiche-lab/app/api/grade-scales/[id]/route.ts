import { NextResponse } from "next/server";
import { audit, guardApi, jsonError, zodError } from "@/lib/api";
import {
  deleteGradeScale,
  gradeScaleSchema,
  gradePreview,
  listGradeScales,
  updateGradeScale,
} from "@/lib/grade-scale/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  const scales = await listGradeScales();
  const scale = scales.find((candidate) => candidate.id === id);
  if (!scale) return jsonError("Scala di conversione non trovata.", 404);
  return NextResponse.json({ scale });
}

export async function PUT(request: Request, { params }: Ctx) {
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

  const { id } = await params;
  try {
    const scale = await updateGradeScale(id, parsed.data);
    await audit(guarded.user.id, "modifica", "GradeScale", id, { name: scale.name });
    return NextResponse.json({ scale, preview: gradePreview(parsed.data) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Modifica non riuscita.", 400);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    await deleteGradeScale(id);
    await audit(guarded.user.id, "eliminazione", "GradeScale", id, {});
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Eliminazione non riuscita.", 400);
  }
}
