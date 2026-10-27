import { guardApi } from "@/lib/api";
import { exportSingle } from "@/lib/export/service";
import { fileResponse, routeError } from "@/lib/api-response";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const guarded = await guardApi(request, { csrf: false });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  try {
    const result = await exportSingle(id, guarded.user, "json", "verifica");
    return fileResponse(result.buffer, result.filename, result.contentType);
  } catch (error) {
    return routeError(error, "Esportazione JSON non riuscita.");
  }
}
