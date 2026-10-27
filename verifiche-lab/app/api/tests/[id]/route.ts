import { NextResponse } from "next/server";
import { guardApi, jsonError, zodError } from "@/lib/api";
import {
  deleteTest,
  updateTestMeta,
} from "@/lib/generation/service";
import { getTestForUser, serializeTest } from "@/lib/tests/repository";
import { testPatchSchema } from "@/lib/schemas";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  try {
    const test = await getTestForUser(id, guarded.user);
    return NextResponse.json({ test: serializeTest(test) });
  } catch (error) {
    return routeError(error);
  }
}

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
  const parsed = testPatchSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  try {
    const result = await updateTestMeta(id, guarded.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  try {
    await deleteTest(id, guarded.user);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeError(error);
  }
}
