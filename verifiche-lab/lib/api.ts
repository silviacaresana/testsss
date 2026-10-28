import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
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

export async function requireApiUser(): Promise<SessionUser> {
  return getCurrentUser();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Senza account non c'è un token CSRF da confrontare: per le richieste che modificano dati si
 * accetta solo la stessa origine del sito. Il browser invia l'header Origin nelle richieste
 * cross-site, quindi un'altra pagina web non può far modificare le verifiche dall'esterno.
 */
function isSameOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true; // richieste non da browser (curl, test): nessun cookie da proteggere
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Controlla l'origine della richiesta e restituisce l'utente condiviso, oppure una risposta di errore. */
export async function guardApi(
  request: Request,
  options: { admin?: boolean; csrf?: boolean } = {},
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  if (options.csrf !== false && !isSameOrigin(request)) {
    return { response: jsonError("Richiesta non valida (origine diversa). Ricarica la pagina e riprova.", 403) };
  }
  const user = await requireApiUser();
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
