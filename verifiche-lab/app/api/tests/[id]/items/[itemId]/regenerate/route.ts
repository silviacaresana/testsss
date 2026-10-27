import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { regenerateItem } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id, itemId } = await params;
  try {
    const result = await regenerateItem(id, itemId, guarded.user);
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}
