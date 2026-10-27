import { NextResponse } from "next/server";
import { audit, guardApi, jsonError } from "@/lib/api";
import { getSettingsForAdmin, saveSettings } from "@/lib/admin/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guarded = await guardApi(request, { admin: true, csrf: false });
  if ("response" in guarded) return guarded.response;
  const data = await getSettingsForAdmin();
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const guarded = await guardApi(request, { admin: true });
  if ("response" in guarded) return guarded.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Corpo della richiesta non valido.");
  }
  if (!payload || typeof payload !== "object") return jsonError("Impostazioni non valide.");

  try {
    const updated = await saveSettings(payload as Record<string, unknown>);
    await audit(guarded.user.id, "modifica", "Setting", "", { campi: updated });
    const data = await getSettingsForAdmin();
    return NextResponse.json({ ...data, updated });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Salvataggio non riuscito.", 400);
  }
}
