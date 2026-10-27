import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api";
import { duplicateItem } from "@/lib/generation/service";
import { routeError } from "@/lib/api-response";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id, itemId } = await params;
  try {
    const test = await duplicateItem(id, itemId, guarded.user);
    return NextResponse.json({ test }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
