import { requireUser } from "@/lib/auth/session";
import { listCurricula } from "@/lib/curriculum/service";
import { GenerateWizard, type WizardCurriculum } from "@/components/wizard/generate-wizard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nuova verifica" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NewTestPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const all = await listCurricula(user, { status: "pubblicato" });
  const curricula: WizardCurriculum[] = all.map((curriculum) => ({
    id: curriculum.id,
    track: curriculum.track as WizardCurriculum["track"],
    year: curriculum.year,
    subject: curriculum.subject as WizardCurriculum["subject"],
    title: curriculum.title,
    version: curriculum.version,
    authorName: curriculum.authorName,
    topics: curriculum.topics.map((topic) => ({
      id: topic.id,
      code: topic.code,
      name: topic.name,
      description: topic.description,
      weightHint: topic.weightHint,
      difficultyMin: topic.difficultyMin,
      difficultyMax: topic.difficultyMax,
      isCore: topic.isCore,
      objectives: topic.objectives.map((objective) => ({
        id: objective.id,
        code: objective.code,
        text: objective.text,
      })),
    })),
  }));

  return (
    <GenerateWizard
      curricula={curricula}
      initialTrack={first(params.track) === "classico" ? "classico" : first(params.track) === "scientifico" ? "scientifico" : undefined}
      initialSubject={first(params.subject) === "fisica" ? "fisica" : first(params.subject) === "matematica" ? "matematica" : undefined}
      initialYear={Number(first(params.year)) >= 1 && Number(first(params.year)) <= 5 ? Number(first(params.year)) : undefined}
    />
  );
}
