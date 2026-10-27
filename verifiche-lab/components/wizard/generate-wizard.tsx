"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Copy,
  Dices,
  GraduationCap,
  LayoutTemplate,
  ListTree,
  Loader2,
  Lock,
  Minus,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { generationRequestSchema } from "@/lib/schemas";
import { ITEM_TYPES, itemTypeLabel, subjectLabel, trackLabel } from "@/lib/constants";
import { cn, formatEuro } from "@/lib/utils";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Modal } from "@/components/ui/modal";
import { Breadcrumbs } from "@/components/ui/page-header";

export type WizardTrack = "classico" | "scientifico";
export type WizardSubject = "matematica" | "fisica";

export interface WizardCurriculum {
  id: string;
  track: WizardTrack;
  year: number;
  subject: WizardSubject;
  title: string;
  version: number;
  authorName: string;
  topics: {
    id: string;
    code: string;
    name: string;
    description: string;
    weightHint: number;
    difficultyMin: number;
    difficultyMax: number;
    isCore: boolean;
    objectives: { id: string; code: string; text: string }[];
  }[];
}

interface Draft {
  track: WizardTrack;
  year: number;
  subject: WizardSubject;
  curriculumId: string;
  title: string;
  classLabel: string;
  examDate: string;
  selectedTopics: Record<string, number>;
  itemCount: number;
  types: string[];
  longProblem: boolean;
  theoryQuestions: boolean;
  difficultyTarget: number;
  totalPoints: number;
  durationMin: number;
  calculatorAllowed: boolean;
  formulaSheet: boolean;
  trigTables: boolean;
  noDerivatives: boolean;
  onlyDefinitions: boolean;
  simplifiedLanguage: boolean;
  answerSpace: boolean;
  versions: number;
  vary: "numeri" | "ordine" | "domande";
  seed: number;
}

const DRAFT_KEY = "vl-wizard-draft-v1";

function randomSeed() {
  return Math.floor(Math.random() * 2_000_000_000);
}

function defaultDraft(
  track: WizardTrack,
  subject: WizardSubject,
  year: number,
  curricula: WizardCurriculum[],
): Draft {
  const curriculum = curricula.find((item) => item.track === track && item.subject === subject && item.year === year);
  return {
    track,
    year,
    subject,
    curriculumId: curriculum?.id ?? "",
    title: "",
    classLabel: "",
    examDate: "",
    selectedTopics: Object.fromEntries((curriculum?.topics ?? []).map((topic) => [topic.id, topic.weightHint || 10])),
    itemCount: 8,
    types: defaultTypes(track, subject),
    longProblem: true,
    theoryQuestions: subject === "fisica",
    difficultyTarget: 3,
    totalPoints: 100,
    durationMin: 60,
    calculatorAllowed: subject === "fisica",
    formulaSheet: subject === "fisica",
    trigTables: false,
    noDerivatives: false,
    onlyDefinitions: false,
    simplifiedLanguage: false,
    answerSpace: true,
    versions: 1,
    vary: "numeri",
    seed: randomSeed(),
  };
}

function defaultTypes(track: WizardTrack, subject: WizardSubject): string[] {
  if (subject === "fisica") return ["exercise", "problem", "multiple_choice", "lab_data"];
  if (track === "classico") return ["exercise", "open_answer", "short_answer", "multiple_choice"];
  return ["exercise", "problem", "short_answer", "multiple_choice"];
}

const STEPS = [
  { key: "contesto", label: "Contesto", icon: Compass, hint: "Indirizzo, anno, materia e programma" },
  { key: "argomenti", label: "Argomenti", icon: ListTree, hint: "Topic del curricolo e pesi" },
  { key: "struttura", label: "Struttura", icon: LayoutTemplate, hint: "Quesiti, tipologie, difficoltà" },
  { key: "punteggi", label: "Punti e tempo", icon: Target, hint: "Totale e durata della prova" },
  { key: "vincoli", label: "Vincoli", icon: SlidersHorizontal, hint: "Strumenti e adattamenti" },
  { key: "versioni", label: "Versioni", icon: Copy, hint: "Varianti A–D e variazione" },
  { key: "genera", label: "Genera", icon: Sparkles, hint: "Riepilogo e creazione" },
] as const;

const TYPE_DESCRIPTIONS: Record<string, string> = {
  multiple_choice: "Quattro opzioni, una corretta",
  true_false: "Affermazioni da validare",
  short_answer: "Risposta sintetica, 2–5 righe",
  open_answer: "Svolgimento argomentato",
  exercise: "Applicazione procedurale",
  problem: "Situazione articolata",
  graph: "Lettura o costruzione di grafico",
  lab_data: "Dati sperimentali e incertezze",
  proof: "Dimostrazione guidata",
};

function roundQuarter(value: number) {
  return Math.round(value * 4) / 4;
}

function suggestedTitle(track: WizardTrack, subject: WizardSubject, year: number) {
  return `Verifica di ${subjectLabel(subject)} — ${year}ª ${track === "classico" ? "Classico" : "Scientifico"}`;
}

export function GenerateWizard({
  curricula,
  initialTrack,
  initialSubject,
  initialYear,
}: {
  curricula: WizardCurriculum[];
  initialTrack?: WizardTrack;
  initialSubject?: WizardSubject;
  initialYear?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() =>
    defaultDraft(initialTrack ?? "scientifico", initialSubject ?? "matematica", initialYear ?? 1, curricula),
  );
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("Preparo il contesto didattico…");
  const [estimate, setEstimate] = useState<{
    provider: string;
    model: string;
    costEstimate: number;
    estimatedSeconds: number;
    offline: boolean;
    monthlySpend: number;
    monthlyBudget: number;
  } | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const curriculumOptions = useMemo(
    () => curricula.filter((item) => item.track === draft.track && item.year === draft.year && item.subject === draft.subject),
    [curricula, draft.track, draft.year, draft.subject],
  );
  const curriculum = useMemo(
    () => curriculumOptions.find((item) => item.id === draft.curriculumId) ?? curriculumOptions[0],
    [curriculumOptions, draft.curriculumId],
  );

  const selectedEntries = useMemo(() => {
    if (!curriculum) return [];
    return curriculum.topics
      .filter((topic) => draft.selectedTopics[topic.id] !== undefined)
      .map((topic) => ({ topic, weight: draft.selectedTopics[topic.id] ?? 0 }));
  }, [curriculum, draft.selectedTopics]);

  const totalWeight = selectedEntries.reduce((sum, entry) => sum + entry.weight, 0);
  const pointsPerItem = draft.itemCount > 0 ? roundQuarter(draft.totalPoints / draft.itemCount) : 0;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<Draft>;
        const base = defaultDraft(
          stored.track ?? initialTrack ?? "scientifico",
          stored.subject ?? initialSubject ?? "matematica",
          stored.year ?? initialYear ?? 1,
          curricula,
        );
        const merged: Draft = { ...base, ...stored };
        const match = curricula.find(
          (item) => item.track === merged.track && item.year === merged.year && item.subject === merged.subject,
        );
        if (match && !curricula.some((item) => item.id === merged.curriculumId)) merged.curriculumId = match.id;
        if (!merged.title) merged.title = suggestedTitle(merged.track, merged.subject, merged.year);
        setDraft(merged);
      } else {
        setDraft((current) => ({
          ...current,
          title: suggestedTitle(current.track, current.subject, current.year),
        }));
      }
    } catch {
      /* bozza locale non leggibile */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  useEffect(() => {
    if (!curriculum) return;
    const valid = new Set(curriculum.topics.map((topic) => topic.id));
    const hasSelected = Object.keys(draft.selectedTopics).some((id) => valid.has(id));
    if (!hasSelected) {
      setDraft((current) => ({
        ...current,
        selectedTopics: Object.fromEntries(curriculum.topics.map((topic) => [topic.id, topic.weightHint || 10])),
      }));
    }
  }, [curriculum, draft.selectedTopics]);

  const update = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  function selectContext(patch: Partial<Pick<Draft, "track" | "year" | "subject">>) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      const options = curricula.filter(
        (item) => item.track === next.track && item.year === next.year && item.subject === next.subject,
      );
      const match = options.find((item) => item.id === next.curriculumId) ?? options[0];
      next.curriculumId = match?.id ?? "";
      if (match) {
        next.selectedTopics = Object.fromEntries(match.topics.map((topic) => [topic.id, topic.weightHint || 10]));
      } else {
        next.selectedTopics = {};
      }
      if (
        !current.title ||
        current.title === suggestedTitle(current.track, current.subject, current.year)
      ) {
        next.title = suggestedTitle(next.track, next.subject, next.year);
      }
      return next;
    });
  }

  function toggleType(type: string) {
    setDraft((current) => ({
      ...current,
      types: current.types.includes(type)
        ? current.types.filter((value) => value !== type)
        : [...current.types, type],
    }));
  }

  function toggleTopic(topicId: string, weight: number) {
    setDraft((current) => {
      const next = { ...current.selectedTopics };
      if (next[topicId] !== undefined) delete next[topicId];
      else next[topicId] = weight || 10;
      return { ...current, selectedTopics: next };
    });
  }

  function setWeight(topicId: string, weight: number) {
    setDraft((current) => ({
      ...current,
      selectedTopics: { ...current.selectedTopics, [topicId]: Math.max(0, Math.min(100, weight)) },
    }));
  }

  function selectAllTopics() {
    if (!curriculum) return;
    setDraft((current) => ({
      ...current,
      selectedTopics: Object.fromEntries(curriculum.topics.map((topic) => [topic.id, topic.weightHint || 10])),
    }));
  }

  function buildRequest() {
    return {
      title: draft.title,
      track: draft.track,
      year: draft.year,
      subject: draft.subject,
      curriculumId: curriculum?.id ?? draft.curriculumId,
      classLabel: draft.classLabel,
      examDate: draft.examDate || null,
      durationMin: draft.durationMin,
      totalPoints: draft.totalPoints,
      difficultyTarget: draft.difficultyTarget,
      selectedTopics: selectedEntries.map((entry) => ({ topicId: entry.topic.id, weight: entry.weight })),
      itemCount: draft.itemCount,
      types: draft.types,
      longProblem: draft.longProblem,
      theoryQuestions: draft.theoryQuestions,
      calculatorAllowed: draft.calculatorAllowed,
      formulaSheet: draft.formulaSheet,
      trigTables: draft.trigTables,
      noDerivatives: draft.noDerivatives,
      onlyDefinitions: draft.onlyDefinitions,
      simplifiedLanguage: draft.simplifiedLanguage,
      answerSpace: draft.answerSpace,
      versions: draft.versions,
      vary: draft.vary,
      seed: draft.seed,
    };
  }

  const currentValidation = useMemo(() => {
    const problems: string[] = [];
    if (step === 0) {
      if (!curriculum) problems.push("Seleziona un programma pubblicato per questo contesto.");
      if (draft.title.trim().length < 3) problems.push("Il titolo deve avere almeno 3 caratteri.");
    }
    if (step === 1 && selectedEntries.length === 0) {
      problems.push("Seleziona almeno un argomento del programma.");
    }
    if (step === 2) {
      if (draft.itemCount < 3 || draft.itemCount > 20) problems.push("Il numero di quesiti deve essere tra 3 e 20.");
      if (draft.types.length === 0) problems.push("Scegli almeno una tipologia di quesito.");
    }
    if (step === 3) {
      if (draft.totalPoints <= 0 || draft.totalPoints > 200) problems.push("Il punteggio totale deve essere tra 1 e 200.");
      if (draft.durationMin < 20 || draft.durationMin > 240) problems.push("La durata deve essere tra 20 e 240 minuti.");
      if (Math.abs(draft.totalPoints * 4 - Math.round(draft.totalPoints * 4)) > 1e-9) {
        problems.push("Il totale deve essere intero oppure con .25 o .5.");
      }
    }
    return problems;
  }, [step, curriculum, draft, selectedEntries.length]);

  const allValidation = useMemo(() => {
    const parsed = generationRequestSchema.safeParse(buildRequest());
    if (parsed.success) return { ok: true as const, issues: [] as string[] };
    return {
      ok: false as const,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "richiesta"}: ${issue.message}`),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, curriculum, selectedEntries]);

  useEffect(() => {
    if (step !== 6) return;
    if (!allValidation.ok) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch<NonNullable<typeof estimate>>("/api/tests/estimate", {
          method: "POST",
          body: buildRequest(),
        });
        if (!cancelled) {
          setEstimate(data);
          setEstimateError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setEstimate(null);
          setEstimateError(err instanceof ApiError ? err.message : "Stima non disponibile.");
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, allValidation.ok, JSON.stringify(buildRequest())]);

  async function generate() {
    setError(null);
    setIssues([]);
    if (!allValidation.ok) {
      setIssues(allValidation.issues);
      return;
    }
    const parsed = generationRequestSchema.safeParse(buildRequest());
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
      return;
    }
    setGenerating(true);
    setStage("Preparo il contesto didattico…");
    const stages = [
      "Preparo il contesto didattico…",
      "Seleziono i quesiti dal programma…",
      "Scrivo consegne, soluzioni e criteri…",
      "Controllo punteggi, tempi e duplicati…",
      "Riequilibrio e preparo la bozza…",
    ];
    let stageIndex = 0;
    const timer = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, stages.length - 1);
      setStage(stages[stageIndex]);
    }, 2600);
    try {
      const result = await apiFetch<{ primaryId: string; warnings: string[]; adjustments: string[] }>(
        "/api/tests/generate",
        { method: "POST", body: parsed.data },
      );
      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/verifiche/${result.primaryId}?nuova=1`);
    } catch (err) {
      window.clearInterval(timer);
      setGenerating(false);
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues([...err.issues, ...((err.payload as { warnings?: string[] })?.warnings ?? [])]);
      } else {
        setError("La generazione non è riuscita. I dati del wizard sono stati conservati.");
      }
    } finally {
      window.clearInterval(timer);
    }
  }

  function resetDraft() {
    const next = defaultDraft(draft.track, draft.subject, draft.year, curricula);
    setDraft({ ...next, title: suggestedTitle(next.track, next.subject, next.year) });
    setStep(0);
    setConfirmReset(false);
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  if (curricula.length === 0) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Verifiche", href: "/verifiche" }, { label: "Nuova verifica" }]} />
        <Card>
          <CardBody className="py-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <h1 className="mt-3 text-xl font-semibold">Serve prima un programma pubblicato</h1>
            <p className="mx-auto mt-2 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
              Il generatore costruisce ogni verifica a partire dai topic e dagli obiettivi del dipartimento.
              Crea un programma per il tuo indirizzo, anno e materia, oppure chiedi al referente di pubblicarlo.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <ButtonLink href="/programmi" variant="outline">
                Vai ai programmi
              </ButtonLink>
              <ButtonLink href="/verifiche">Torna alle verifiche</ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Verifiche", href: "/verifiche" }, { label: "Nuova verifica" }]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker">Wizard di generazione</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight sm:text-[30px]">Componi la verifica</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            Sette passaggi dal programma alla bozza. Potrai rivedere e modificare ogni quesito prima di
            approvare la verifica.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 text-emerald-600" />
            Bozza salvata in locale
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            Ricomincia
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[236px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ol className="hidden space-y-1 lg:block">
            {STEPS.map((item, index) => {
              const active = index === step;
              const done = index < step;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setStep(index)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition",
                      active ? "bg-primary/[0.07]" : "hover:bg-muted/70",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : done
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-[13px] font-semibold", active ? "text-primary" : "")}>
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="rounded-lg border bg-card/70 px-3.5 py-3 lg:mt-4">
            <p className="kicker">Riepilogo rapido</p>
            <dl className="mt-2 space-y-1.5 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Contesto</dt>
                <dd className="text-right font-medium">
                  {draft.subject === "matematica" ? "Matematica" : "Fisica"} · {draft.year}ª
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Argomenti</dt>
                <dd className="font-medium">{selectedEntries.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Quesiti</dt>
                <dd className="font-medium">
                  {draft.itemCount} · {draft.totalPoints} pt
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Tempo</dt>
                <dd className="font-medium">{draft.durationMin} min</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Versioni</dt>
                <dd className="font-medium">{draft.versions}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
            <p className="text-[12px] font-semibold text-muted-foreground">
              Passo {step + 1} di {STEPS.length}
            </p>
            <div className="flex gap-1" aria-hidden>
              {STEPS.map((item, index) => (
                <span
                  key={item.key}
                  className={cn("h-1.5 w-5 rounded-full", index <= step ? "bg-primary" : "bg-border")}
                />
              ))}
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title={STEPS[step].label}
              description={STEPS[step].hint}
              icon={(() => {
                const Icon = STEPS[step].icon;
                return <Icon className="h-4 w-4" />;
              })()}
              action={<Badge tone="neutral">Passo {step + 1} / 7</Badge>}
            />

            <CardBody className="space-y-6">
              {step === 0 ? (
                <ContextStep
                  draft={draft}
                  curricula={curricula}
                  curriculumOptions={curriculumOptions}
                  curriculum={curriculum}
                  onContext={selectContext}
                  onCurriculum={(id) => {
                    const match = curricula.find((item) => item.id === id);
                    setDraft((current) => ({
                      ...current,
                      curriculumId: id,
                      selectedTopics: match
                        ? Object.fromEntries(match.topics.map((topic) => [topic.id, topic.weightHint || 10]))
                        : {},
                    }));
                  }}
                  update={update}
                />
              ) : null}

              {step === 1 ? (
                <TopicsStep
                  curriculum={curriculum}
                  selected={draft.selectedTopics}
                  totalWeight={totalWeight}
                  onToggle={toggleTopic}
                  onWeight={setWeight}
                  onAll={selectAllTopics}
                  onNone={() => update("selectedTopics", {})}
                />
              ) : null}

              {step === 2 ? (
                <StructureStep draft={draft} update={update} toggleType={toggleType} />
              ) : null}

              {step === 3 ? (
                <ScoringStep draft={draft} update={update} pointsPerItem={pointsPerItem} />
              ) : null}

              {step === 4 ? <ConstraintsStep draft={draft} update={update} /> : null}

              {step === 5 ? <VersionsStep draft={draft} update={update} /> : null}

              {step === 6 ? (
                <ReviewStep
                  draft={draft}
                  curriculum={curriculum}
                  selectedEntries={selectedEntries}
                  totalWeight={totalWeight}
                  estimate={estimate}
                  estimateError={estimateError}
                  issues={allValidation.ok ? [] : allValidation.issues}
                  error={error}
                  issuesFromServer={issues}
                  onGenerate={generate}
                  generating={generating}
                />
              ) : null}

              {currentValidation.length > 0 ? (
                <Notice tone="warning" title="Completa questo passaggio">
                  <ul className="list-disc pl-4">
                    {currentValidation.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Notice>
              ) : null}
            </CardBody>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/25 px-5 py-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0 || generating}
              >
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </Button>
              <div className="flex items-center gap-2">
                {step < 6 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      if (currentValidation.length > 0) return;
                      setStep((value) => Math.min(6, value + 1));
                    }}
                    disabled={currentValidation.length > 0}
                  >
                    Avanti
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={generate} disabled={!allValidation.ok || generating} loading={generating}>
                    <Wand2 className="h-4 w-4" />
                    Genera la verifica
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {generating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-card p-7 text-center shadow-2xl animate-fade-in">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Sto preparando la verifica</h2>
            <p className="mt-1 min-h-[40px] text-[13px] leading-relaxed text-muted-foreground">{stage}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Non chiudere questa scheda. La bozza comparirà appena pronta.
            </p>
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Ricomincere da capo?"
        description="La bozza salvata in questo browser verrà eliminata."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={resetDraft}>
              Azzera la bozza
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Le verifiche già generate non vengono toccate: si azzerano solo le scelte di questo wizard non ancora
          inviate.
        </p>
      </Modal>
    </div>
  );
}

function ContextStep({
  draft,
  curricula,
  curriculumOptions,
  curriculum,
  onContext,
  onCurriculum,
  update,
}: {
  draft: Draft;
  curricula: WizardCurriculum[];
  curriculumOptions: WizardCurriculum[];
  curriculum: WizardCurriculum | undefined;
  onContext: (patch: Partial<Pick<Draft, "track" | "year" | "subject">>) => void;
  onCurriculum: (id: string) => void;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  const availableTracks = new Set(curricula.map((item) => item.track));
  const availableSubjects = new Set(
    curricula.filter((item) => item.track === draft.track && item.year === draft.year).map((item) => item.subject),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["scientifico", "classico"] as const).map((track) => {
          const disabled = !availableTracks.has(track);
          return (
            <button
              key={track}
              type="button"
              onClick={() => onContext({ track })}
              disabled={disabled}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                draft.track === track
                  ? "border-primary bg-primary/[0.05] ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/35",
                disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <div className="flex items-center justify-between">
                <GraduationCap className="h-4 w-4 text-primary" />
                {draft.track === track ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
              </div>
              <p className="mt-2.5 text-[14px] font-semibold">{trackLabel(track)}</p>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                {track === "classico"
                  ? "Lettura, argomentazione, meno calcolo simbolico."
                  : "Calcolo, formalizzazione e problemi articolati."}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Anno di corso" htmlFor="year" required>
          <Select id="year" value={draft.year} onChange={(event) => onContext({ year: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5].map((year) => (
              <option key={year} value={year}>
                {year}ª
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Materia" htmlFor="subject" required>
          <Select
            id="subject"
            value={draft.subject}
            onChange={(event) => onContext({ subject: event.target.value as WizardSubject })}
          >
            <option value="matematica" disabled={!availableSubjects.has("matematica") && draft.subject !== "matematica"}>
              Matematica
            </option>
            <option value="fisica" disabled={!availableSubjects.has("fisica") && draft.subject !== "fisica"}>
              Fisica
            </option>
          </Select>
        </Field>
      </div>

      <Field
        label="Programma di riferimento"
        htmlFor="curriculum"
        required
        hint={
          curriculum
            ? `Versione ${curriculum.version} · ${curriculum.authorName} · ${curriculum.topics.length} argomenti`
            : "Nessun programma pubblicato per questo contesto."
        }
      >
        <Select
          id="curriculum"
          value={curriculum?.id ?? ""}
          onChange={(event) => onCurriculum(event.target.value)}
          disabled={curriculumOptions.length === 0}
        >
          {curriculumOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} (v{item.version})
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titolo della verifica" htmlFor="title" required hint="Compare nell'intestazione e nel nome del file.">
          <Input
            id="title"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Verifica di Matematica — 1ª Scientifico"
            maxLength={160}
          />
        </Field>
        <Field label="Classe" htmlFor="classLabel" hint="Testo libero, ad esempio «1ª B». Facoltativo.">
          <Input
            id="classLabel"
            value={draft.classLabel}
            onChange={(event) => update("classLabel", event.target.value)}
            placeholder="1ª B"
            maxLength={60}
          />
        </Field>
      </div>

      <Field label="Data della prova" htmlFor="examDate" hint="Facoltativa. Se vuota, resta indicata solo la durata.">
        <Input
          id="examDate"
          type="date"
          value={draft.examDate}
          onChange={(event) => update("examDate", event.target.value)}
        />
      </Field>

      {curriculum ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">Programma pubblicato</Badge>
            <Badge tone="neutral">v{curriculum.version}</Badge>
            <Badge tone="neutral">{curriculum.topics.length} argomenti</Badge>
            <Badge tone="neutral">
              {curriculum.topics.reduce((sum, topic) => sum + topic.objectives.length, 0)} obiettivi
            </Badge>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {curriculum.title} · {trackLabel(curriculum.track)} · {curriculum.year}ª · {subjectLabel(curriculum.subject)}
          </p>
        </div>
      ) : (
        <Notice tone="warning" title="Programma mancante">
          Non risulta un programma pubblicato per {trackLabel(draft.track)}, {draft.year}ª di{" "}
          {subjectLabel(draft.subject)}. Pubblica il programma o scegli un altro contesto.
        </Notice>
      )}
    </div>
  );
}

function TopicsStep({
  curriculum,
  selected,
  totalWeight,
  onToggle,
  onWeight,
  onAll,
  onNone,
}: {
  curriculum: WizardCurriculum | undefined;
  selected: Record<string, number>;
  totalWeight: number;
  onToggle: (topicId: string, weight: number) => void;
  onWeight: (topicId: string, weight: number) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  if (!curriculum) return <Notice tone="warning">Seleziona prima un programma nel passo 1.</Notice>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">{Object.keys(selected).length}</span> argomenti selezionati su{" "}
          {curriculum.topics.length}. Il peso orienta la distribuzione dei quesiti.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onAll}>
            Seleziona tutti
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onNone}>
            Azzera
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {curriculum.topics.map((topic) => {
          const active = selected[topic.id] !== undefined;
          return (
            <div
              key={topic.id}
              className={cn(
                "rounded-xl border p-3.5 transition",
                active ? "border-primary/45 bg-primary/[0.035]" : "border-border bg-card hover:border-primary/25",
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(topic.id, topic.weightHint || 10)}
                  className="mt-1 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                  aria-label={`Seleziona ${topic.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                      {topic.code}
                    </span>
                    <span className="text-[13.5px] font-semibold">{topic.name}</span>
                    <Badge tone={topic.isCore ? "green" : "neutral"}>{topic.isCore ? "portante" : "secondario"}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      difficoltà {topic.difficultyMin}–{topic.difficultyMax} · {topic.objectives.length} obiettivi
                    </span>
                  </div>
                  {topic.description ? (
                    <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{topic.description}</p>
                  ) : null}
                  {active ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                        Peso
                        <input
                          type="range"
                          min={0}
                          max={50}
                          value={selected[topic.id] ?? 10}
                          onChange={(event) => onWeight(topic.id, Number(event.target.value))}
                          className="h-1.5 w-28 accent-[hsl(var(--primary))]"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={selected[topic.id] ?? 10}
                          onChange={(event) => onWeight(topic.id, Number(event.target.value))}
                          className="h-7 w-14 rounded border border-input px-1.5 text-center text-[11.5px]"
                        />
                        %
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-[12px] text-muted-foreground">
        Peso complessivo selezionato: <span className="font-semibold text-foreground">{totalWeight}%</span>. Il
        generatore usa i pesi come proporzione, non come vincolo rigido: la copertura di tutti gli argomenti
        selezionati resta obbligatoria.
      </div>
    </div>
  );
}

function StructureStep({
  draft,
  update,
  toggleType,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  toggleType: (type: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Numero di quesiti"
          htmlFor="itemCount"
          hint="Da 3 a 20. Con 100 punti e 60 minuti, 8–10 quesiti è un buon equilibrio."
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => update("itemCount", Math.max(3, draft.itemCount - 1))}
              aria-label="Riduci il numero di quesiti"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              id="itemCount"
              type="number"
              min={3}
              max={20}
              value={draft.itemCount}
              onChange={(event) => update("itemCount", Number(event.target.value))}
              className="text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => update("itemCount", Math.min(20, draft.itemCount + 1))}
              aria-label="Aumenta il numero di quesiti"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Field>

        <Field label="Difficoltà media" htmlFor="difficulty" hint={`Livello ${draft.difficultyTarget} su 5`}>
          <div className="flex items-center gap-3 pt-1">
            <input
              id="difficulty"
              type="range"
              min={1}
              max={5}
              step={1}
              value={draft.difficultyTarget}
              onChange={(event) => update("difficultyTarget", Number(event.target.value))}
              className="h-1.5 flex-1 accent-[hsl(var(--primary))]"
            />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <span
                  key={level}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[10.5px] font-semibold",
                    level <= draft.difficultyTarget
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {level}
                </span>
              ))}
            </div>
          </div>
        </Field>
      </div>

      <div>
        <p className="label-base">Tipologie di quesito</p>
        <p className="hint mb-3">Scegli il mix. Il generatore rispetta le tipologie selezionate e le adatta al profilo dell&apos;indirizzo.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ITEM_TYPES.map((type) => {
            const active = draft.types.includes(type.value);
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => toggleType(type.value)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                  active
                    ? "border-primary/50 bg-primary/[0.04]"
                    : "border-border bg-card hover:border-primary/25",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                  )}
                  aria-hidden
                >
                  {active ? <Check className="h-3 w-3" /> : null}
                </span>
                <span>
                  <span className="block text-[12.5px] font-semibold">{type.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {TYPE_DESCRIPTIONS[type.value] ?? "Tipologia disponibile"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox
          label="Includi un problema lungo"
          description="Un quesito articolato, con più passaggi e punteggio maggiore."
          checked={draft.longProblem}
          onChange={(event) => update("longProblem", event.target.checked)}
        />
        <Checkbox
          label="Includi domande teoriche"
          description="Definizioni, enunciati e giustificazioni, adatte anche al Classico."
          checked={draft.theoryQuestions}
          onChange={(event) => update("theoryQuestions", event.target.checked)}
        />
      </div>
    </div>
  );
}

function ScoringStep({
  draft,
  update,
  pointsPerItem,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  pointsPerItem: number;
}) {
  const presets = [
    { points: 100, minutes: 60, label: "Verifica ordinaria" },
    { points: 80, minutes: 50, label: "Prova breve" },
    { points: 100, minutes: 90, label: "Prova lunga" },
  ];
  const tolerance = draft.durationMin * 0.1;
  const expectedLast = roundQuarter(draft.totalPoints - pointsPerItem * (draft.itemCount - 1));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Punteggio totale" htmlFor="totalPoints" hint="Valori interi o con .25 / .5. Il totale dei quesiti deve coincidere.">
          <Input
            id="totalPoints"
            type="number"
            min={1}
            max={200}
            step={0.25}
            value={draft.totalPoints}
            onChange={(event) => update("totalPoints", Number(event.target.value))}
          />
        </Field>
        <Field label="Durata della prova (minuti)" htmlFor="durationMin" hint="La stima dei tempi deve restare entro il ±10%.">
          <Input
            id="durationMin"
            type="number"
            min={20}
            max={240}
            step={5}
            value={draft.durationMin}
            onChange={(event) => update("durationMin", Number(event.target.value))}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={`${preset.points}-${preset.minutes}`}
            type="button"
            size="sm"
            variant={
              draft.totalPoints === preset.points && draft.durationMin === preset.minutes ? "primary" : "outline"
            }
            onClick={() => {
              update("totalPoints", preset.points);
              update("durationMin", preset.minutes);
            }}
          >
            {preset.label} · {preset.points} pt / {preset.minutes} min
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Media per quesito</p>
          <p className="mt-1 font-serif text-2xl font-semibold">{pointsPerItem} pt</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ultimo quesito: {expectedLast > 0 ? `${expectedLast} pt` : "da rivedere"}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Minuti per quesito</p>
          <p className="mt-1 font-serif text-2xl font-semibold">
            {(draft.durationMin / Math.max(1, draft.itemCount)).toFixed(1)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Tempo medio disponibile</p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tolleranza tempo</p>
          <p className="mt-1 font-serif text-2xl font-semibold">
            ±{Math.round(tolerance)}
            <span className="text-base"> min</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Stima ammessa: {Math.max(0, Math.round(draft.durationMin - tolerance))}–
            {Math.round(draft.durationMin + tolerance)} min
          </p>
        </div>
      </div>

      <Notice tone="info" title="Come vengono distribuiti i punti">
        Il generatore assegna i punti in quarti di punto e corregge l&apos;ultimo quesito per chiudere esattamente
        il totale. Se modifichi un punteggio nell&apos;editor, potrai chiedere il riequilibrio assistito.
      </Notice>
    </div>
  );
}

function ConstraintsStep({
  draft,
  update,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-base">Strumenti consentiti</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Checkbox
            label="Calcolatrice"
            description="Indicata nell'intestazione; i calcoli restano progettati per essere fattibili a mano."
            checked={draft.calculatorAllowed}
            onChange={(event) => update("calculatorAllowed", event.target.checked)}
          />
          <Checkbox
            label="Formulario"
            description="Il PDF include una pagina di formule essenziali."
            checked={draft.formulaSheet}
            onChange={(event) => update("formulaSheet", event.target.checked)}
          />
          <Checkbox
            label="Tavole goniometriche"
            description="Allegato con valori notevoli e riduzioni."
            checked={draft.trigTables}
            onChange={(event) => update("trigTables", event.target.checked)}
          />
          <Checkbox
            label="Spazio per lo svolgimento"
            description="Righe o riquadri dopo ogni consegna, in base alla tipologia."
            checked={draft.answerSpace}
            onChange={(event) => update("answerSpace", event.target.checked)}
          />
        </div>
      </div>

      <div>
        <p className="label-base">Limiti didattici</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Checkbox
            label="Senza derivate"
            description="Esclude gli argomenti che richiedono il calcolo differenziale."
            checked={draft.noDerivatives}
            onChange={(event) => update("noDerivatives", event.target.checked)}
          />
          <Checkbox
            label="Solo definizioni"
            description="Verifica di definizioni e proprietà, senza esercizi di calcolo."
            checked={draft.onlyDefinitions}
            onChange={(event) => update("onlyDefinitions", event.target.checked)}
          />
          <Checkbox
            label="Linguaggio semplificato (DSA/BES)"
            description="Frasi più brevi, consegne esplicite e interlinea maggiore. La misura compensativa resta a carico del docente."
            checked={draft.simplifiedLanguage}
            onChange={(event) => update("simplifiedLanguage", event.target.checked)}
          />
        </div>
      </div>

      {draft.onlyDefinitions ? (
        <Notice tone="info">
          Con «solo definizioni» il motore privilegia domande teoriche e riduce i quesiti di calcolo. Se hai
          selezionato tipologie come «problema» o «esercizio», verranno adattate o sostituite.
        </Notice>
      ) : null}
      {draft.simplifiedLanguage ? (
        <Notice tone="warning" title="Adattamento, non sostituzione">
          La versione semplificata è una base di lavoro: verifica tu le misure compensative e il tempo aggiuntivo
          previsto dal PDP.
        </Notice>
      ) : null}
    </div>
  );
}

function VersionsStep({
  draft,
  update,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-base">Quante versioni?</p>
        <p className="hint mb-2">Utile per file affiancati o recuperi. Ogni versione è una verifica separata, con la stessa struttura.</p>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => update("versions", count)}
              className={cn(
                "rounded-lg border px-3 py-3 text-center transition",
                draft.versions === count
                  ? "border-primary bg-primary/[0.06] text-primary"
                  : "border-border bg-card hover:border-primary/30",
              )}
            >
              <span className="block font-serif text-xl font-semibold">{count}</span>
              <span className="mt-0.5 block text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {count === 1 ? "versione" : "versioni"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label-base">Cosa variare</p>
        <div className="mt-2 space-y-2">
          {[
            { value: "numeri", label: "Numeri e dati", text: "Stessa struttura, valori diversi: la più usata per file affiancati." },
            { value: "ordine", label: "Ordine dei quesiti", text: "Stessi quesiti, sequenza rimescolata." },
            { value: "domande", label: "Domande", text: "Variazioni più profonde, con consegne riformulate. Rivedile con attenzione." },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition",
                draft.vary === option.value ? "border-primary/50 bg-primary/[0.04]" : "border-border bg-card",
              )}
            >
              <input
                type="radio"
                name="vary"
                value={option.value}
                checked={draft.vary === option.value}
                onChange={() => update("vary", option.value as Draft["vary"])}
                className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block text-[13px] font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{option.text}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Field
        label="Seed di generazione"
        htmlFor="seed"
        hint="Con lo stesso seed e la stessa richiesta, la bozza è riproducibile. Conservalo per rigenerare."
      >
        <div className="flex gap-2">
          <Input
            id="seed"
            type="number"
            min={0}
            max={2_000_000_000}
            value={draft.seed}
            onChange={(event) => update("seed", Number(event.target.value))}
          />
          <Button type="button" variant="outline" onClick={() => update("seed", randomSeed())}>
            <Dices className="h-4 w-4" />
            Cambia
          </Button>
        </div>
      </Field>

      <Notice tone="info">
        Le versioni condividono programma, punteggi e durata, ma sono salvate come verifiche autonome: potrai
        approvarle e modificarle separatamente.
      </Notice>
    </div>
  );
}

function ReviewStep({
  draft,
  curriculum,
  selectedEntries,
  totalWeight,
  estimate,
  estimateError,
  issues,
  issuesFromServer,
  error,
  onGenerate,
  generating,
}: {
  draft: Draft;
  curriculum: WizardCurriculum | undefined;
  selectedEntries: { topic: WizardCurriculum["topics"][number]; weight: number }[];
  totalWeight: number;
  estimate: {
    provider: string;
    model: string;
    costEstimate: number;
    estimatedSeconds: number;
    offline: boolean;
    monthlySpend: number;
    monthlyBudget: number;
  } | null;
  estimateError: string | null;
  issues: string[];
  issuesFromServer: string[];
  error: string | null;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="space-y-5">
      {error ? (
        <Notice tone="error" title="Generazione non riuscita">
          {error}
          {issuesFromServer.length > 0 ? (
            <ul className="mt-2 list-disc pl-4">
              {issuesFromServer.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {issues.length > 0 ? (
        <Notice tone="warning" title="Controlla questi punti">
          <ul className="list-disc pl-4">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="kicker">Contesto</p>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            <Row label="Titolo" value={draft.title} />
            <Row label="Indirizzo" value={trackLabel(draft.track)} />
            <Row label="Anno e materia" value={`${draft.year}ª · ${subjectLabel(draft.subject)}`} />
            <Row label="Classe" value={draft.classLabel || "—"} />
            <Row label="Data" value={draft.examDate ? new Date(draft.examDate).toLocaleDateString("it-IT") : "non indicata"} />
          </dl>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="kicker">Prova</p>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            <Row label="Quesiti" value={String(draft.itemCount)} />
            <Row label="Punteggio" value={`${draft.totalPoints} punti`} />
            <Row label="Durata" value={`${draft.durationMin} minuti`} />
            <Row label="Difficoltà" value={`${draft.difficultyTarget} / 5`} />
            <Row label="Versioni" value={`${draft.versions} · varia ${draft.vary}`} />
          </dl>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="kicker">Programma e argomenti</p>
          <Badge tone="green">peso {totalWeight}%</Badge>
        </div>
        <p className="mt-2 text-[13px] font-semibold">{curriculum?.title}</p>
        <p className="text-[11.5px] text-muted-foreground">
          versione {curriculum?.version} · {selectedEntries.length} argomenti selezionati
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {selectedEntries.map((entry) => (
            <span
              key={entry.topic.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px]"
            >
              {entry.topic.name}
              <span className="text-muted-foreground">{entry.weight}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="kicker">Tipologie</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {draft.types.map((type) => (
            <Badge key={type} tone="blue">
              {itemTypeLabel(type)}
            </Badge>
          ))}
          {draft.longProblem ? <Badge tone="violet">problema lungo</Badge> : null}
          {draft.theoryQuestions ? <Badge tone="amber">teoria</Badge> : null}
          {draft.simplifiedLanguage ? <Badge tone="neutral">DSA/BES</Badge> : null}
          {draft.calculatorAllowed ? <Badge tone="neutral">calcolatrice</Badge> : null}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Stima</p>
            {estimate ? (
              <div className="mt-1.5 space-y-1 text-[12.5px]">
                <p className="font-semibold">
                  {estimate.offline ? "Generatore offline deterministico" : `${estimate.provider} · ${estimate.model}`}
                </p>
                <p className="text-muted-foreground">
                  {estimate.offline
                    ? "Nessuna chiamata esterna, nessun costo."
                    : `Costo stimato ${formatEuro(estimate.costEstimate)} · circa ${estimate.estimatedSeconds}s`}
                </p>
                {!estimate.offline ? (
                  <p className="text-[11px] text-muted-foreground">
                    Spesa mese: {formatEuro(estimate.monthlySpend)} su {formatEuro(estimate.monthlyBudget)}
                  </p>
                ) : null}
              </div>
            ) : estimateError ? (
              <p className="mt-1.5 text-[12.5px] text-destructive">{estimateError}</p>
            ) : (
              <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calcolo la stima…
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-1">
              <Lock className="h-3 w-3" /> Nessun dato studente
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-1">
              <ClipboardCheck className="h-3 w-3" /> Bozza modificabile
            </span>
          </div>
        </div>
      </div>

      <Notice tone="info" title="Cosa succede dopo">
        La verifica viene salvata in stato «bozza». Controlla consegne, soluzioni e punteggi nell&apos;editor,
        poi approva per considerarla ufficiale ed esportare il pacchetto LaTeX/PDF.
      </Notice>

      <Button type="button" size="lg" onClick={onGenerate} disabled={generating || issues.length > 0} loading={generating} className="w-full sm:w-auto">
        <Sparkles className="h-4 w-4" />
        Genera la verifica
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[62%] truncate text-right font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
