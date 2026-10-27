import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { restoreTestVersion } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id, versionId } = await params;
  try {
    const test = await restoreTestVersion(id, versionId, guarded.user);
    return NextResponse.json({ test });
  } catch (error) {
    return routeError(error);
  }
}
