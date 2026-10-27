import { requireAdmin } from "@/lib/auth/session";
import { getSettingsForAdmin } from "@/lib/admin/settings";
import { PageHeader } from "@/components/ui/page-header";
import { AdminSettings } from "@/components/admin/admin-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Impostazioni" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const data = await getSettingsForAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Amministrazione"
        title="Impostazioni"
        description="Istituto, generatore e motore LaTeX. Le modifiche valgono per tutto il dipartimento e sono registrate nel log."
      />
      <AdminSettings
        fields={data.fields}
        initialValues={data.values as Record<string, string>}
        apiKeyMasked={data.apiKeyMasked}
        envProvider={data.envProvider}
      />
    </div>
  );
}
