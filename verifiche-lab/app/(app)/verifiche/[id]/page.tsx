import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canEditTest, getTestForUser, serializeTest } from "@/lib/tests/repository";
import { listGradeScales } from "@/lib/grade-scale/service";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { TestEditor } from "@/components/editor/test-editor";
import type { GradeScaleOption, TopicOption } from "@/components/editor/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const test = await prisma.test.findUnique({ where: { id }, select: { title: true } }).catch(() => null);
  return { title: test?.title ?? "Verifica" };
}

export default async function TestDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const isNew = first(query.nuova) === "1";

  let test;
  try {
    test = await getTestForUser(id, user);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Non è stato possibile caricare la verifica richiesta.";
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title="Verifica non accessibile"
            description={message}
            action={
              <ButtonLink href="/verifiche" variant="outline" size="sm">
                <ArrowLeft className="h-3.5 w-3.5" />
                Torna alle verifiche
              </ButtonLink>
            }
          />
        </CardBody>
      </Card>
    );
  }

  const serialized = serializeTest(test);
  const [topicRows, gradeScaleRows] = await Promise.all([
    test.curriculumId
      ? prisma.topic.findMany({
          where: { curriculumId: test.curriculumId },
          orderBy: [{ order: "asc" }, { code: "asc" }],
          select: { id: true, code: true, name: true, isCore: true },
        })
      : Promise.resolve([]),
    listGradeScales(),
  ]);

  const topics: TopicOption[] = topicRows.map((topic) => ({
    id: topic.id,
    code: topic.code,
    name: topic.name,
    isCore: topic.isCore,
  }));

  const gradeScales: GradeScaleOption[] = gradeScaleRows.map((scale) => ({
    id: scale.id,
    name: scale.name,
    totalPoints: scale.totalPoints,
    sufficiencyThreshold: scale.sufficiencyThreshold,
    mapping: scale.mapping as GradeScaleOption["mapping"],
    isDefault: scale.isDefault,
  }));

  return (
    <div className="space-y-3">
      <Link
        href="/verifiche"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Tutte le verifiche
      </Link>
      <TestEditor
        initialTest={serialized}
        topics={topics}
        gradeScales={gradeScales}
        canEdit={canEditTest(user, test)}
        isNew={isNew}
      />
    </div>
  );
}
