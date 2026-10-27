import { NextResponse } from "next/server";
import { audit, guardApi, jsonError, zodError } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  curriculumInputSchema,
  deleteCurriculum,
  getCurriculum,
  updateCurriculum,
} from "@/lib/curriculum/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    const curriculum = await getCurriculum(id);
    return NextResponse.json({ curriculum });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Programma non trovato.", 404);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }

  const parsed = curriculumInputSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const curriculum = await updateCurriculum(id, parsed.data, guarded.user);
    return NextResponse.json({ curriculum });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Modifica non riuscita.", 400);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    const existing = await prisma.curriculum.findUnique({
      where: { id },
      select: { title: true, authorId: true, status: true },
    });
    if (!existing) return jsonError("Programma non trovato.", 404);
    if (existing.authorId !== guarded.user.id && guarded.user.role !== "admin") {
      return jsonError("Non hai i permessi per eliminare questo programma.", 403);
    }
    await deleteCurriculum(id, guarded.user);
    await audit(guarded.user.id, "eliminazione", "Curriculum", id, { title: existing.title });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Eliminazione non riuscita.", 400);
  }
}

export async function PATCH() {
  return jsonError("Usa PUT per aggiornare un programma.", 405);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET,PUT,DELETE" } });
}
