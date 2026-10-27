import { NextResponse } from "next/server";
import { guardApi, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { diffCurricula } from "@/lib/curriculum/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;

  const { id } = await params;
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");

  try {
    const to = await prisma.curriculum.findUnique({
      where: { id },
      select: { track: true, year: true, subject: true, version: true },
    });
    if (!to) return jsonError("Programma non trovato.", 404);

    const fromId =
      fromParam ||
      (
        await prisma.curriculum.findFirst({
          where: {
            track: to.track,
            year: to.year,
            subject: to.subject,
            version: { lt: to.version },
          },
          orderBy: { version: "desc" },
          select: { id: true },
        })
      )?.id;

    if (!fromId) {
      return NextResponse.json({ diff: null, message: "Non esiste una versione precedente da confrontare." });
    }
    const diff = await diffCurricula(fromId, id);
    return NextResponse.json({ diff });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Confronto non riuscito.", 400);
  }
}
