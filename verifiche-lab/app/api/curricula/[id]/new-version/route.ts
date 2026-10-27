import { NextResponse } from "next/server";
import { guardApi, jsonError } from "@/lib/api";
import { newCurriculumVersion } from "@/lib/curriculum/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    const curriculum = await newCurriculumVersion(id, guarded.user);
    return NextResponse.json({ curriculum }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Creazione della versione non riuscita.", 400);
  }
}
