import { NextResponse } from "next/server";
import { guardApi, jsonError } from "@/lib/api";
import { publishCurriculum } from "@/lib/curriculum/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  try {
    const curriculum = await publishCurriculum(id, guarded.user);
    return NextResponse.json({ curriculum });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Pubblicazione non riuscita.", 400);
  }
}
