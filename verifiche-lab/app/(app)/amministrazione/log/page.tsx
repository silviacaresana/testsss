import { requireAdmin } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { AdminLogs } from "@/components/admin/admin-logs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Log e consumi" };

export default async function AdminLogsPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Amministrazione"
        title="Log e consumi"
        description="Traccia delle generazioni AI e delle azioni amministrative. I prompt sono conservati solo se l'opzione è attiva; i dati degli studenti non sono mai registrati."
      />
      <AdminLogs />
    </div>
  );
}
