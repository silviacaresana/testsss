import { guardApi, jsonError } from "@/lib/api";
import { exportSingle, exportZip, type ExportKind } from "@/lib/export/service";
import { fileResponse, routeError } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const KINDS = new Set(["verifica", "soluzioni", "griglia"]);

export async function POST(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;

  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const format = String(body.format ?? url.searchParams.get("format") ?? "pdf");
  const rawKind = String(body.kind ?? body.type ?? url.searchParams.get("kind") ?? "verifica");
  if (format !== "tex" && format !== "pdf" && format !== "zip" && format !== "json") {
    return jsonError("Formato non supportato: scegli tex, pdf, zip o json.", 422);
  }

  try {
    if (format === "zip" || rawKind === "pacchetto") {
      const result = await exportZip(id, guarded.user);
      return fileResponse(result.buffer, result.filename, result.contentType);
    }
    const kind: Exclude<ExportKind, "pacchetto"> = KINDS.has(rawKind)
      ? (rawKind as Exclude<ExportKind, "pacchetto">)
      : "verifica";
    const result = await exportSingle(id, guarded.user, format, kind);
    return fileResponse(result.buffer, result.filename, result.contentType);
  } catch (error) {
    return routeError(error, "Esportazione non riuscita.");
  }
}
