import { NextResponse } from "next/server";
import { guardApi, zodError } from "@/lib/api";
import { curriculumInputSchema, createCurriculum, listCurricula } from "@/lib/curriculum/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;

  const url = new URL(request.url);
  const track = url.searchParams.get("track") ?? undefined;
  const subject = url.searchParams.get("subject") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const year = Number(url.searchParams.get("year") ?? 0);

  const curricula = await listCurricula(guarded.user, {
    track,
    subject,
    status,
    year: year >= 1 && year <= 5 ? year : undefined,
  });
  return NextResponse.json({ curricula });
}

export async function POST(request: Request) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo della richiesta non valido." }, { status: 400 });
  }

  const parsed = curriculumInputSchema.safeParse(payload);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const curriculum = await createCurriculum(parsed.data, guarded.user);
    return NextResponse.json({ curriculum }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Creazione del programma non riuscita." },
      { status: 400 },
    );
  }
}
