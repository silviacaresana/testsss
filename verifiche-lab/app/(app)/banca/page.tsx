import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { bankAccessFilter, listTags, serializeBankEntry } from "@/lib/bank/service";
import { PageHeader } from "@/components/ui/page-header";
import { BankBrowser } from "@/components/bank/bank-browser";

export const dynamic = "force-dynamic";

export const metadata = { title: "Banca quesiti" };

export default async function BankPage() {
  const user = await requireUser();

  const [rows, tags] = await Promise.all([
    prisma.itemBankEntry.findMany({
      where: bankAccessFilter(user),
      orderBy: { createdAt: "desc" },
      take: 120,
      include: { owner: { select: { name: true } } },
    }),
    listTags(),
  ]);

  const entries = rows.map((row) => serializeBankEntry(row, user));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Riutilizzo"
        title="Banca quesiti"
        description="Quesiti già verificati, pronti da inserire in una nuova verifica. Ogni voce conserva testo, soluzione, criteri e difficoltà; la visibilità decide chi può riutilizzarla."
      />
      <BankBrowser initialEntries={entries} tags={tags} currentUserId={user.id} isAdmin={user.role === "admin"} />
    </div>
  );
}
