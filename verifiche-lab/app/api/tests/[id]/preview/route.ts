import { NextResponse } from "next/server";
import { guardApi, jsonError } from "@/lib/api";
import { previewTest } from "@/lib/export/service";
import { htmlResponse, inlineResponse, routeError } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

const KINDS = new Set(["verifica", "soluzioni", "griglia"]);

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind") ?? "verifica";
  if (!KINDS.has(kindParam)) return jsonError("Tipo di anteprima non valido.", 422);
  const kind = kindParam as "verifica" | "soluzioni" | "griglia";
  const format = url.searchParams.get("format") ?? "preview";

  try {
    const result = await previewTest(id, guarded.user, kind);
    if (format === "json") {
      return NextResponse.json({
        ok: Boolean(result.pdf),
        engineAvailable: result.engineAvailable,
        log: result.log,
        kind,
      });
    }
    if (format === "html" || !result.pdf) {
      return htmlResponse(result.html);
    }
    return inlineResponse(result.pdf, "application/pdf", `anteprima-${kind}.pdf`);
  } catch (error) {
    return routeError(error, "Anteprima non disponibile.");
  }
}
