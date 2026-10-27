"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Diff,
  FilePlus2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { subjectLabel, trackLabel } from "@/lib/constants";
import { cn, formatDateIT } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { Breadcrumbs } from "@/components/ui/page-header";

export interface CurriculumObjectiveView {
  code: string;
  text: string;
  prerequisites: string[];
  keywords: string[];
}

export interface CurriculumTopicView {
  code: string;
  name: string;
  description: string;
  weightHint: number;
  difficultyMin: number;
  difficultyMax: number;
  isCore: boolean;
  objectives: CurriculumObjectiveView[];
}

export interface CurriculumView {
  id: string;
  track: string;
  year: number;
  subject: string;
  version: number;
  status: string;
  title: string;
  notes: string;
  authorId: string;
  authorName: string;
  testsCount: number;
  canEdit: boolean;
  topics: CurriculumTopicView[];
}

interface VersionSummary {
  id: string;
  version: number;
  status: string;
  title: string;
  updatedAt: string;
}

interface CurriculumDiff {
  from: { id: string; version: number; title: string };
  to: { id: string; version: number; title: string };
  topicsAdded: { code: string; name: string }[];
  topicsRemoved: { code: string; name: string }[];
  topicsChanged: { code: string; name: string; changes: string[] }[];
  objectivesAdded: { topic: string; code: string; text: string }[];
  objectivesRemoved: { topic: string; code: string; text: string }[];
}

type Feedback = { tone: "success" | "error" | "warning" | "info"; message: string; issues?: string[] };

function clone(curriculum: CurriculumView): CurriculumView {
  return {
    ...curriculum,
    topics: curriculum.topics.map((topic) => ({
      ...topic,
      objectives: topic.objectives.map((objective) => ({
        ...objective,
        prerequisites: [...objective.prerequisites],
        keywords: [...objective.keywords],
      })),
    })),
  };
}

function nextTopicCode(topics: CurriculumTopicView[]): string {
  let index = topics.length + 1;
  const used = new Set(topics.map((topic) => topic.code));
  let code = `T${index}`;
  while (used.has(code)) {
    index += 1;
    code = `T${index}`;
  }
  return code;
}

export function CurriculumEditor({
  initialCurriculum,
  versions,
  canPublish,
}: {
  initialCurriculum: CurriculumView;
  versions: VersionSummary[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => clone(initialCurriculum));
  const [baseline, setBaseline] = useState(() => clone(initialCurriculum));
  const [openTopics, setOpenTopics] = useState<Record<number, boolean>>(() => ({ 0: true }));
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diff, setDiff] = useState<CurriculumDiff | null>(null);
  const [diffMessage, setDiffMessage] = useState<string | null>(null);

  const readOnly = !draft.canEdit;
  const totalWeight = useMemo(() => draft.topics.reduce((sum, topic) => sum + topic.weightHint, 0), [draft.topics]);
  const objectivesCount = useMemo(
    () => draft.topics.reduce((sum, topic) => sum + topic.objectives.length, 0),
    [draft.topics],
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function apply(next: unknown) {
    const curriculum = next as CurriculumView;
    const merged = clone({ ...curriculum, canEdit: draft.canEdit });
    setDraft(merged);
    setBaseline(clone(merged));
  }

  async function run<T>(label: string, action: () => Promise<T>, message?: string): Promise<T | undefined> {
    setBusy(label);
    setFeedback(null);
    try {
      const result = await action();
      if (message) setFeedback({ tone: "success", message });
      return result;
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Operazione non riuscita.",
        issues: error instanceof ApiError ? error.issues : undefined,
      });
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  function updateTopic(index: number, patch: Partial<CurriculumTopicView>) {
    setDraft((prev) => ({
      ...prev,
      topics: prev.topics.map((topic, position) => (position === index ? { ...topic, ...patch } : topic)),
    }));
  }

  function updateObjective(topicIndex: number, objectiveIndex: number, patch: Partial<CurriculumObjectiveView>) {
    setDraft((prev) => ({
      ...prev,
      topics: prev.topics.map((topic, position) =>
        position === topicIndex
          ? {
              ...topic,
              objectives: topic.objectives.map((objective, objectivePosition) =>
                objectivePosition === objectiveIndex ? { ...objective, ...patch } : objective,
              ),
            }
          : topic,
      ),
    }));
  }

  function addTopic() {
    setDraft((prev) => ({
      ...prev,
      topics: [
        ...prev.topics,
        {
          code: nextTopicCode(prev.topics),
          name: "Nuovo argomento",
          description: "",
          weightHint: prev.topics.length === 0 ? 100 : Math.max(1, Math.round(100 / (prev.topics.length + 1))),
          difficultyMin: 1,
          difficultyMax: 3,
          isCore: true,
          objectives: [],
        },
      ],
    }));
    setOpenTopics((prev) => ({ ...prev, [draft.topics.length]: true }));
  }

  function removeTopic(index: number) {
    setDraft((prev) => ({ ...prev, topics: prev.topics.filter((_, position) => position !== index) }));
  }

  function moveTopic(index: number, direction: -1 | 1) {
    setDraft((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.topics.length) return prev;
      const topics = [...prev.topics];
      [topics[index], topics[target]] = [topics[target], topics[index]];
      return { ...prev, topics };
    });
    setOpenTopics((prev) => ({ ...prev, [index]: true, [index + direction]: true }));
  }

  function addObjective(topicIndex: number) {
    setDraft((prev) => ({
      ...prev,
      topics: prev.topics.map((topic, position) =>
        position === topicIndex
          ? {
              ...topic,
              objectives: [
                ...topic.objectives,
                {
                  code: `${topic.code}.${topic.objectives.length + 1}`,
                  text: "",
                  prerequisites: [],
                  keywords: [],
                },
              ],
            }
          : topic,
      ),
    }));
  }

  function removeObjective(topicIndex: number, objectiveIndex: number) {
    setDraft((prev) => ({
      ...prev,
      topics: prev.topics.map((topic, position) =>
        position === topicIndex
          ? { ...topic, objectives: topic.objectives.filter((_, index) => index !== objectiveIndex) }
          : topic,
      ),
    }));
  }

  function normalizeWeights() {
    if (draft.topics.length === 0) return;
    setDraft((prev) => {
      const total = prev.topics.reduce((sum, topic) => sum + Math.max(0, topic.weightHint), 0);
      if (total <= 0) {
        const even = Math.round(100 / prev.topics.length);
        return { ...prev, topics: prev.topics.map((topic) => ({ ...topic, weightHint: even })) };
      }
      return {
        ...prev,
        topics: prev.topics.map((topic) => ({
          ...topic,
          weightHint: Math.max(1, Math.round((Math.max(0, topic.weightHint) / total) * 100)),
        })),
      };
    });
  }

  async function save() {
    const payload = {
      track: draft.track,
      year: draft.year,
      subject: draft.subject,
      title: draft.title.trim(),
      notes: draft.notes,
      topics: draft.topics.map((topic) => ({
        code: topic.code.trim(),
        name: topic.name.trim(),
        description: topic.description,
        weightHint: topic.weightHint,
        difficultyMin: topic.difficultyMin,
        difficultyMax: topic.difficultyMax,
        isCore: topic.isCore,
        objectives: topic.objectives
          .map((objective, index) => ({
            code: objective.code.trim() || `${topic.code.trim()}.${index + 1}`,
            text: objective.text.trim(),
            prerequisites: objective.prerequisites,
            keywords: objective.keywords,
          }))
          .filter((objective) => objective.text.length >= 3),
      })),
    };
    const result = await run("save", () =>
      apiFetch<{ curriculum: CurriculumView }>(`/api/curricula/${draft.id}`, { method: "PUT", body: payload }),
    "Programma salvato.");
    if (result) apply(result.curriculum);
  }

  async function publish() {
    const result = await run("publish", () =>
      apiFetch<{ curriculum: CurriculumView }>(`/api/curricula/${draft.id}/publish`, { method: "POST" }),
    "Programma pubblicato: da ora è selezionabile nel wizard per questa combinazione di indirizzo, anno e materia.");
    if (result) apply(result.curriculum);
  }

  async function archive() {
    const result = await run("archive", () =>
      apiFetch<{ curriculum: CurriculumView }>(`/api/curricula/${draft.id}/archive`, { method: "POST" }),
    "Programma archiviato.");
    if (result) apply(result.curriculum);
  }

  async function createVersion() {
    const result = await run("new-version", () =>
      apiFetch<{ curriculum: CurriculumView }>(`/api/curricula/${draft.id}/new-version`, { method: "POST" }),
    );
    if (result) router.push(`/programmi/${result.curriculum.id}`);
  }

  async function remove() {
    const ok = await run("delete", async () => {
      await apiFetch(`/api/curricula/${draft.id}`, { method: "DELETE" });
      return true;
    });
    if (!ok) return;
    setDeleteOpen(false);
    router.push("/programmi");
  }

  async function openDiff() {
    setDiffOpen(true);
    setBusy("diff");
    setDiff(null);
    setDiffMessage(null);
    setFeedback(null);
    try {
      const result = await apiFetch<{ diff: CurriculumDiff | null; message?: string }>(
        `/api/curricula/${draft.id}/diff`,
      );
      setDiff(result.diff);
      setDiffMessage(result.message ?? null);
    } catch (error) {
      setDiffMessage(error instanceof ApiError ? error.message : "Confronto non riuscito.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Programmi", href: "/programmi" }, { label: draft.title }]} />

      {readOnly ? (
        <Notice tone="info" title="Programma pubblicato: sola lettura">
          Per modificare i contenuti crea una nuova versione. Le verifiche già generate restano collegate a questa versione,
          così la loro griglia e i loro obiettivi non cambiano.
        </Notice>
      ) : null}

      {feedback ? (
        <Notice
          tone={feedback.tone}
          title={feedback.tone === "error" ? "Operazione non riuscita" : undefined}
          action={
            <Button type="button" variant="ghost" size="sm" onClick={() => setFeedback(null)}>
              Chiudi
            </Button>
          }
        >
          <p>{feedback.message}</p>
          {feedback.issues && feedback.issues.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {feedback.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <p className="kicker mb-1.5">Programma · versione {draft.version}</p>
          <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">{draft.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={draft.status} />
            <Badge tone="blue">{subjectLabel(draft.subject)}</Badge>
            <Badge tone="neutral">{trackLabel(draft.track)}</Badge>
            <Badge tone="neutral">{draft.year}ª</Badge>
            <Badge tone="violet">{draft.topics.length} argomenti</Badge>
            <Badge tone="neutral">{objectivesCount} obiettivi</Badge>
            {dirty ? <Badge tone="amber">modifiche non salvate</Badge> : null}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {draft.authorName} · {draft.testsCount} {draft.testsCount === 1 ? "verifica collegata" : "verifiche collegate"}
            {draft.status === "pubblicato" ? " · base condivisa del dipartimento" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draft.canEdit ? (
            <Button type="button" size="sm" loading={busy === "save"} disabled={!dirty} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" />
              Salva
            </Button>
          ) : null}
          {canPublish && draft.status !== "pubblicato" ? (
            <Button type="button" variant="outline" size="sm" loading={busy === "publish"} onClick={() => void publish()}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Pubblica
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" loading={busy === "new-version"} onClick={() => void createVersion()}>
            <FilePlus2 className="h-3.5 w-3.5" />
            Nuova versione
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void openDiff()}>
            <Diff className="h-3.5 w-3.5" />
            Confronta
          </Button>
          {draft.canEdit ? (
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-medium text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground">
                <Archive className="h-3.5 w-3.5" />
                Altro
                <ChevronDown className="h-3 w-3" />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border bg-card p-1 shadow-xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-muted"
                  onClick={() => void archive()}
                  disabled={draft.status === "archiviato"}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archivia programma
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Elimina programma
                </button>
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Peso complessivo</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-serif text-[22px] font-semibold leading-none">{totalWeight}%</p>
            <Badge tone={totalWeight === 100 ? "green" : "amber"}>{totalWeight === 100 ? "bilanciato" : "da normalizzare"}</Badge>
          </div>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Argomenti</p>
          <p className="mt-1 font-serif text-[22px] font-semibold leading-none">{draft.topics.length}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Obiettivi operativi</p>
          <p className="mt-1 font-serif text-[22px] font-semibold leading-none">{objectivesCount}</p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Dati del programma"
              description="Titolo e note aiutano i colleghi a riconoscere il documento di riferimento."
              icon={<BookOpen className="h-4 w-4" />}
            />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Field label="Titolo" className="sm:col-span-2">
                <Input
                  value={draft.title}
                  disabled={readOnly}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
              </Field>
              <Field label="Contesto">
                <Input value={`${trackLabel(draft.track)} · ${draft.year}ª · ${subjectLabel(draft.subject)}`} disabled />
              </Field>
              <Field label="Versione">
                <Input value={`v${draft.version}`} disabled />
              </Field>
              <Field label="Note" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={draft.notes}
                  disabled={readOnly}
                  onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Riferimenti dipartimentali, criteri comuni, annotazioni…"
                />
              </Field>
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[18px] font-semibold">Argomenti e obiettivi</h2>
            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={normalizeWeights} disabled={draft.topics.length === 0}>
                  Normalizza pesi a 100
                </Button>
                <Button type="button" size="sm" onClick={addTopic}>
                  <Plus className="h-3.5 w-3.5" />
                  Argomento
                </Button>
              </div>
            ) : null}
          </div>

          {draft.topics.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-muted-foreground">
                  Nessun argomento. {readOnly ? "" : "Aggiungi il primo argomento per rendere pubblicabile il programma."}
                </p>
              </CardBody>
            </Card>
          ) : null}

          {draft.topics.map((topic, topicIndex) => {
            const open = openTopics[topicIndex] ?? false;
            return (
              <Card key={topicIndex} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/25 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenTopics((prev) => ({ ...prev, [topicIndex]: !open }))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open ? "rotate-0" : "-rotate-90")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {topicIndex + 1}. {topic.name || "Senza titolo"}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {topic.code} · {topic.objectives.length} obiettivi · peso {topic.weightHint}%
                      </span>
                    </span>
                  </button>
                  {!readOnly ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        disabled={topicIndex === 0}
                        onClick={() => moveTopic(topicIndex, -1)}
                        aria-label="Sposta argomento su"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        disabled={topicIndex === draft.topics.length - 1}
                        onClick={() => moveTopic(topicIndex, 1)}
                        aria-label="Sposta argomento giù"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                        onClick={() => removeTopic(topicIndex)}
                        aria-label="Elimina argomento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {open ? (
                  <CardBody className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[110px_1fr_100px_100px_100px]">
                      <Field label="Codice">
                        <Input
                          value={topic.code}
                          disabled={readOnly}
                          onChange={(event) => updateTopic(topicIndex, { code: event.target.value })}
                        />
                      </Field>
                      <Field label="Nome">
                        <Input
                          value={topic.name}
                          disabled={readOnly}
                          onChange={(event) => updateTopic(topicIndex, { name: event.target.value })}
                        />
                      </Field>
                      <Field label="Peso %">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={topic.weightHint}
                          disabled={readOnly}
                          onChange={(event) => updateTopic(topicIndex, { weightHint: Number(event.target.value) })}
                        />
                      </Field>
                      <Field label="Diff. min">
                        <Select
                          value={topic.difficultyMin}
                          disabled={readOnly}
                          onChange={(event) => updateTopic(topicIndex, { difficultyMin: Number(event.target.value) })}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Diff. max">
                        <Select
                          value={topic.difficultyMax}
                          disabled={readOnly}
                          onChange={(event) => updateTopic(topicIndex, { difficultyMax: Number(event.target.value) })}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>

                    <Field label="Descrizione">
                      <Textarea
                        rows={2}
                        value={topic.description}
                        disabled={readOnly}
                        onChange={(event) => updateTopic(topicIndex, { description: event.target.value })}
                      />
                    </Field>

                    <Checkbox
                      label="Argomento del nucleo fondante"
                      description="I nuclei fondanti pesano di più quando il generatore distribuisce i punti."
                      checked={topic.isCore}
                      disabled={readOnly}
                      onChange={(event) => updateTopic(topicIndex, { isCore: event.target.checked })}
                    />

                    <div className="rounded-lg border bg-muted/15 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Obiettivi operativi
                        </p>
                        {!readOnly ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => addObjective(topicIndex)}>
                            <Plus className="h-3.5 w-3.5" />
                            Obiettivo
                          </Button>
                        ) : null}
                      </div>

                      {topic.objectives.length === 0 ? (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                          Nessun obiettivo: il programma non potrà essere pubblicato finché non ne aggiungi almeno uno.
                        </p>
                      ) : null}

                      <div className="mt-2 space-y-2">
                        {topic.objectives.map((objective, objectiveIndex) => (
                          <div key={objectiveIndex} className="rounded-md border bg-card p-2.5">
                            <div className="flex items-start gap-2">
                              <Input
                                value={objective.code}
                                disabled={readOnly}
                                onChange={(event) => updateObjective(topicIndex, objectiveIndex, { code: event.target.value })}
                                className="h-8 w-[110px] shrink-0 text-[12px]"
                                aria-label="Codice obiettivo"
                              />
                              <Textarea
                                rows={2}
                                value={objective.text}
                                disabled={readOnly}
                                onChange={(event) => updateObjective(topicIndex, objectiveIndex, { text: event.target.value })}
                                className="min-h-[38px] flex-1 text-[12.5px]"
                                placeholder="Descrivi un obiettivo osservabile…"
                              />
                              {!readOnly ? (
                                <button
                                  type="button"
                                  className="mt-1 rounded-md p-1 text-red-600 hover:bg-red-50"
                                  onClick={() => removeObjective(topicIndex, objectiveIndex)}
                                  aria-label="Elimina obiettivo"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardBody>
                ) : null}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Versioni" description="Cronologia dello stesso curricolo." />
            <div className="divide-y">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => router.push(`/programmi/${version.id}`)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[12.5px] transition hover:bg-muted/50",
                    version.id === draft.id && "bg-primary/[0.05]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">v{version.version}</span>
                    <span className="block text-[10.5px] text-muted-foreground">{formatDateIT(version.updatedAt)}</span>
                  </span>
                  <StatusBadge status={version.status} />
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Buone pratiche" />
            <CardBody className="space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <p>1. Un programma pubblicato non si modifica: crea una nuova versione e pubblicala.</p>
              <p>2. I pesi degli argomenti guidano la distribuzione dei punti nel wizard.</p>
              <p>3. Gli obiettivi compaiono nella griglia di valutazione delle verifiche generate.</p>
              <p>4. Archivia i programmi superati: restano consultabili ma non selezionabili.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        title="Confronto con la versione precedente"
        size="lg"
        footer={
          <Button type="button" variant="outline" onClick={() => setDiffOpen(false)}>
            Chiudi
          </Button>
        }
      >
        {busy === "diff" ? (
          <p className="text-[13px] text-muted-foreground">Confronto in corso…</p>
        ) : diffMessage ? (
          <Notice tone="info">{diffMessage}</Notice>
        ) : diff ? (
          <div className="space-y-4 text-[12.5px]">
            <p className="text-muted-foreground">
              Da v{diff.from.version} a v{diff.to.version}. Le modifiche sono calcolate su codici di argomento e obiettivo.
            </p>
            {[
              { label: "Argomenti aggiunti", items: diff.topicsAdded.map((topic) => `${topic.code} · ${topic.name}`) },
              { label: "Argomenti rimossi", items: diff.topicsRemoved.map((topic) => `${topic.code} · ${topic.name}`) },
              {
                label: "Argomenti modificati",
                items: diff.topicsChanged.map((topic) => `${topic.code} · ${topic.name}: ${topic.changes.join("; ")}`),
              },
              {
                label: "Obiettivi aggiunti",
                items: diff.objectivesAdded.map((objective) => `${objective.topic}.${objective.code} · ${objective.text}`),
              },
              {
                label: "Obiettivi rimossi",
                items: diff.objectivesRemoved.map((objective) => `${objective.topic}.${objective.code} · ${objective.text}`),
              },
            ].map((section) => (
              <div key={section.label}>
                <p className="font-semibold">
                  {section.label} ({section.items.length})
                </p>
                {section.items.length === 0 ? (
                  <p className="text-muted-foreground">Nessuna differenza.</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {section.items.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nessun confronto disponibile.</p>
        )}
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminare il programma?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Annulla
            </Button>
            <Button type="button" variant="danger" loading={busy === "delete"} onClick={() => void remove()}>
              <Trash2 className="h-3.5 w-3.5" />
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Il programma e i suoi argomenti verranno eliminati. Le verifiche già generate restano intatte, ma perdono il
          collegamento al curricolo. L&apos;operazione non è reversibile.
        </p>
      </Modal>
    </div>
  );
}
