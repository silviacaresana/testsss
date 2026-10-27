import { requireAdmin } from "@/lib/auth/session";
import { listInvites } from "@/lib/admin/invites";
import { listUsers } from "@/lib/admin/users";
import { PageHeader } from "@/components/ui/page-header";
import { AdminUsers } from "@/components/admin/admin-users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Docenti e inviti" };

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const [users, invites] = await Promise.all([listUsers(), listInvites()]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Amministrazione"
        title="Docenti e inviti"
        description="Crea account, assegna ruoli e reimposta password. Gli inviti sono link monouso validi sette giorni: non esiste registrazione pubblica."
      />
      <AdminUsers initialUsers={users} initialInvites={invites} currentUserId={admin.id} />
    </div>
  );
}
