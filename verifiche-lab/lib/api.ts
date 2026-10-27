import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifyCsrf, type SessionUser } from "@/lib/auth/session";
import { toJson } from "@/lib/utils";

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function zodError(error: ZodError) {
  return NextResponse.json(
    {
      error: "Dati non validi",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    },
    { status: 422 },
  );
}

export type ApiContext = { user: SessionUser };

export async function requireApiUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}

/** Verifica sessione + CSRF e restituisce l'utente, oppure una risposta di errore. */
export async function guardApi(
  request: Request,
  options: { admin?: boolean; csrf?: boolean } = {},
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await requireApiUser();
  if (!user) return { response: jsonError("Sessione scaduta. Effettua di nuovo l'accesso.", 401) };
  if (options.admin && user.role !== "admin") return { response: jsonError("Permessi insufficienti.", 403) };
  if (options.csrf !== false && !verifyCsrf(request)) {
    return { response: jsonError("Richiesta non valida (CSRF). Ricarica la pagina e riprova.", 403) };
  }
  return { user };
}

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId = "",
  meta: Record<string, unknown> = {},
) {
  await prisma.auditLog
    .create({ data: { userId, action, entity, entityId, metaJson: toJson(meta) } })
    .catch(() => undefined);
}

export function parseIssues(error: unknown): string[] {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  if (error instanceof Error) return [error.message];
  return ["Errore sconosciuto"];
}
