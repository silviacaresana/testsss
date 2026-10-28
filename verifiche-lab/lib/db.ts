import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Database su Cloudflare D1.
 *
 * Nei Workers un client Prisma NON va condiviso tra richieste (vedi la guida OpenNext sui
 * database): se ne crea uno per richiesta. `getCloudflareContext()` restituisce l'oggetto della
 * richiesta in corso, quindi lo usiamo come chiave di una WeakMap: dentro la stessa richiesta il
 * client è riusato, a richiesta finita viene rilasciato.
 *
 * `prisma` è un proxy: tutti i moduli continuano a usare `import { prisma } from "@/lib/db"`.
 */

type D1Binding = ConstructorParameters<typeof PrismaD1>[0];

const perRequest = new WeakMap<object, PrismaClient>();

function resolveClient(): PrismaClient {
  const context = getCloudflareContext();
  const cached = perRequest.get(context);
  if (cached) return cached;

  const binding = (context.env as unknown as { DB?: D1Binding }).DB;
  if (!binding) {
    throw new Error(
      "Database non collegato: manca il binding D1 «DB». Controlla wrangler.jsonc (d1_databases).",
    );
  }
  const client = new PrismaClient({ adapter: new PrismaD1(binding) });
  perRequest.set(context, client);
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolveClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
