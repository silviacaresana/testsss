import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canEditCurriculum, getCurriculum } from "@/lib/curriculum/service";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { CurriculumEditor } from "@/components/curriculum/curriculum-editor";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const curriculum = await prisma.curriculum.findUnique({ where: { id }, select: { title: true } }).catch(() => null);
  return { title: curriculum?.title ?? "Programma" };
}

export default async function CurriculumDetailPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;

  let curriculum;
  try {
    curriculum = await getCurriculum(id);
  } catch (error) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Programma non disponibile"
            description={error instanceof Error ? error.message : "Il programma richiesto non esiste."}
            action={
              <ButtonLink href="/programmi" variant="outline" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                Torna ai programmi
              </ButtonLink>
            }
          />
        </CardBody>
      </Card>
    );
  }

  const versions = await prisma.curriculum.findMany({
    where: { track: curriculum.track, year: curriculum.year, subject: curriculum.subject },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true, title: true, updatedAt: true },
  });

  return (
    <div className="space-y-3">
      <Link
        href="/programmi"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Tutti i programmi
      </Link>
      <CurriculumEditor
        initialCurriculum={{ ...curriculum, canEdit: canEditCurriculum(user, { authorId: curriculum.authorId, status: curriculum.status }) }}
        versions={versions.map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          title: version.title,
          updatedAt: version.updatedAt.toISOString(),
        }))}
        canPublish={curriculum.authorId === user.id || user.role === "admin"}
      />
    </div>
  );
}
