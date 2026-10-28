import type { User } from "@prisma/client";
import { ensureBaseData, SHARED_USER } from "@/lib/bootstrap";

/**
 * L'app non ha account né password: tutte le verifiche appartengono a un unico utente
 * condiviso. L'accesso al sito è protetto a monte da Cloudflare Access (vedi docs/cloudflare.md).
 *
 * Il tipo e i nomi delle funzioni restano quelli di prima, così il resto del codice non cambia.
 */

export type SessionUser = Pick<User, "id" | "email" | "name" | "role" | "subjects" | "tracks">;

export async function getCurrentUser(): Promise<SessionUser> {
  await ensureBaseData();
  const { id, email, name, role, subjects, tracks } = SHARED_USER;
  return { id, email, name, role, subjects, tracks };
}

export async function requireUser(): Promise<SessionUser> {
  return getCurrentUser();
}

export async function requireAdmin(): Promise<SessionUser> {
  return getCurrentUser();
}
