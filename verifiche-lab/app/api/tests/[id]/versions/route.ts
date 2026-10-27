import { NextResponse } from "next/server";
import { z } from "zod";
import { guardApi, jsonError, zodError } from "@/lib/api";
import { saveTestVersion } from "@/lib/generation/service";
import { getTestForUser, listVersions } from "@/lib/tests/repository";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ label: z.string().trim().max(120).optional() });

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  try {
    await getTestForUser(id, guarded.user);
    const versions = await listVersions(id);
    return NextResponse.json({ versions });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("Richiesta non valida.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const version = await saveTestVersion(id, guarded.user, parsed.data.label);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
