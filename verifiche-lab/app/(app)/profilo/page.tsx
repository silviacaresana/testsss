import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileForm } from "@/components/profile/profile-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profilo e preferenze" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [row, testsCount, curriculaCount, bankCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { lastLogin: true, createdAt: true } }),
    prisma.test.count({ where: { authorId: user.id } }),
    prisma.curriculum.count({ where: { authorId: user.id } }),
    prisma.itemBankEntry.count({ where: { ownerId: user.id } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Account"
        title="Profilo e preferenze"
        description="I dati del profilo personalizzano l'intestazione delle verifiche e le proposte del generatore. Non raccogliamo dati degli studenti."
      />
      <ProfileForm
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
          subjects: parseJson<string[]>(user.subjects, []),
          tracks: parseJson<string[]>(user.tracks, []),
        }}
        stats={{
          tests: testsCount,
          curricula: curriculaCount,
          bank: bankCount,
          lastLogin: row?.lastLogin ? row.lastLogin.toISOString() : null,
          createdAt: row?.createdAt.toISOString() ?? null,
        }}
      />
    </div>
  );
}
