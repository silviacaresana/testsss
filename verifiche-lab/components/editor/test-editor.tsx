"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  GitBranch,
  History,
  Library,
  ListChecks,
  MoreVertical,
  Plus,
  Scale,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedItem, SerializedTest } from "@/lib/tests/repository";
import { formatDateIT, formatDateTimeIT, cn } from "@/lib/utils";
import { subjectLabel, trackLabel, VISIBILITIES } from "@/lib/constants";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { Breadcrumbs } from "@/components/ui/page-header";
import { BankPicker } from "@/components/editor/bank-picker";
import { ExportPanel } from "@/components/editor/export-panel";
import { ItemCard } from "@/components/editor/item-card";
import { PreviewPanel } from "@/components/editor/preview-panel";
import { RubricPanel } from "@/components/editor/rubric-panel";
import { SettingsModal } from "@/components/editor/settings-modal";
import { VersionsPanel } from "@/components/editor/versions-panel";
import {
  displayItems,
  formatPoints,
  testTotals,
  type EditorTab,
  type GradeScaleOption,
  type TopicOption,
} from "@/components/editor/types";

type Feedback = { tone: "success" | "error" | "info" | "warning"; message: string; issues?: string[] };

const TABS: { key: EditorTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "quesiti", label: "Quesiti", icon: ListChecks },
  { key: "anteprima", label: "Anteprima", icon: Eye },
  { key: "griglia", label: "Griglia e voti", icon: Table2 },
  { key: "versioni", label: "Versioni", icon: History },
  { key: "esporta", label: "Esporta", icon: Download },
];

export function TestEditor({
  initialTest,
  topics,
  gradeScales,
  canEdit,
  isNew,
}: {
  initialTest: SerializedTest;
  topics: TopicOption[];
  gradeScales: GradeScaleOption[];
  canEdit: boolean;
  isNew: boolean;
}) {
  const router = useRouter();
  const [test, setTest] = useState(initialTest);
  const [tab, setTab] = useState<EditorTab>("quesiti");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [newBanner, setNewBanner] = useState(isNew);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankItem, setBankItem] = useState<SerializedItem | null>(null);
  const [bankForm, setBankForm] = useState({ visibility: "dipartimento", tags: "", notes: "" });
  const [deleteItemTarget, setDeleteItemTarget] = useState<SerializedItem | null>(null);
  const [deleteTestOpen, setDeleteTestOpen] = useState(false);
  const [variantOpen, setVariantOpen] = useState(false);
  const [variantLabel, setVariantLabel] = useState<"A" | "B" | "C" | "D">("B");

  const totals = useMemo(() => testTotals(test), [test]);
  const balanced = Math.abs(totals.points - test.totalPoints) < 0.0001;
  const timeOk = Math.abs(totals.minutes - test.durationMin) <= test.durationMin * 0.1;
  const ordered = useMemo(() => displayItems(test), [test]);
  const indexOf = useMemo(() => new Map(ordered.map((item, index) => [item.id, index])), [ordered]);
  const rubricKey = useMemo(() => test.items.map((item) => item.id).join("|"), [test.items]);

  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!balanced) list.push(`La somma dei punti è ${formatPoints(totals.points)} su ${formatPoints(test.totalPoints)}.`);
    if (!timeOk) {
      list.push(
        `Il tempo stimato è ${totals.minutes} min, fuori tolleranza rispetto a ${test.durationMin} min (±10%).`,
      );
    }
    for (const item of ordered) {
      const number = (indexOf.get(item.id) ?? 0) + 1;
      if (item.solutionSteps.length === 0) list.push(`Quesito ${number}: manca la soluzione svolta.`);
      if (item.gradingCriteria.length === 0) list.push(`Quesito ${number}: mancano i criteri di punteggio.`);
      if (item.type === "multiple_choice") {
        if (item.correctOption === null || item.correctOption < 0 || item.correctOption >= item.options.length) {
          list.push(`Quesito ${number}: risposta corretta non valida.`);
        }
      }
    }
    return list;
  }, [balanced, timeOk, totals, test.totalPoints, test.durationMin, ordered, indexOf]);

  function applyTest(next: SerializedTest) {
    setTest(next);
  }

  function success(message: string) {
    setFeedback({ tone: "success", message });
  }

  function fail(message: string, issues?: string[]) {
    setFeedback({ tone: "error", message, issues });
  }

  async function run<T>(
    label: string,
    action: () => Promise<T>,
    successMessage?: string,
  ): Promise<T | undefined> {
    setBusy(label);
    setFeedback(null);
    try {
      const result = await action();
      if (successMessage) success(successMessage);
      return result;
    } catch (error) {
      fail(
        error instanceof ApiError ? error.message : "Operazione non riuscita.",
        error instanceof ApiError ? error.issues : undefined,
      );
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function saveItem(itemId: string, patch: Record<string, unknown>): Promise<boolean> {
    const result = await run(`item-${itemId}`, () =>
      apiFetch<{ test: SerializedTest; suggestion: string | null }>(`/api/tests/${test.id}/items/${itemId}`, {
        method: "PATCH",
        body: patch,
      }),
    );
    if (!result) return false;
    applyTest(result.test);
    if (result.suggestion) {
      setFeedback({ tone: "warning", message: result.suggestion });
    } else {
      success("Quesito aggiornato.");
    }
    return true;
  }

  async function duplicateItem(item: SerializedItem): Promise<boolean> {
    const result = await run("duplicate-item", () =>
      apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/items/${item.id}/duplicate`, { method: "POST" }),
    );
    if (!result) return false;
    applyTest(result.test);
    success("Quesito duplicato.");
    return true;
  }

  async function regenerateItem(item: SerializedItem): Promise<boolean> {
    const result = await run("regenerate-item", () =>
      apiFetch<{ test: SerializedTest; warnings: string[] }>(`/api/tests/${test.id}/items/${item.id}/regenerate`, {
        method: "POST",
      }),
    );
    if (!result) return false;
    applyTest(result.test);
    if (result.warnings.length > 0) {
      setFeedback({ tone: "warning", message: "Quesito rigenerato con avvisi.", issues: result.warnings });
    } else {
      success("Quesito rigenerato: controlla testo, soluzione e criteri prima di approvare.");
    }
    return true;
  }

  async function toggleLock(item: SerializedItem): Promise<boolean> {
    const result = await run(`lock-${item.id}`, () =>
      apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/items/${item.id}`, {
        method: "PATCH",
        body: { isLocked: !item.isLocked },
      }),
    );
    if (!result) return false;
    applyTest(result.test);
    success(item.isLocked ? "Quesito sbloccato." : "Quesito bloccato: non verrà rigenerato.");
    return true;
  }

  async function moveItem(item: SerializedItem, direction: -1 | 1): Promise<boolean> {
    const sectionIds = new Set(test.sections.map((section) => section.id));
    const group =
      item.sectionId && sectionIds.has(item.sectionId)
        ? ordered.filter((entry) => entry.sectionId === item.sectionId)
        : ordered.filter((entry) => !entry.sectionId || !sectionIds.has(entry.sectionId));
    const position = group.findIndex((entry) => entry.id === item.id);
    const target = position + direction;
    if (position < 0 || target < 0 || target >= group.length) return false;
    const ids = ordered.map((entry) => entry.id);
    const first = ids.indexOf(group[position].id);
    const second = ids.indexOf(group[target].id);
    [ids[first], ids[second]] = [ids[second], ids[first]];
    const result = await run("reorder", () =>
      apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/reorder`, {
        method: "POST",
        body: { orderedIds: ids },
      }),
    );
    if (!result) return false;
    applyTest(result.test);
    success("Ordine dei quesiti aggiornato.");
    return true;
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget) return;
    const result = await run("delete-item", () =>
      apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/items/${deleteItemTarget.id}`, {
        method: "DELETE",
      }),
    );
    if (!result) return;
    applyTest(result.test);
    setDeleteItemTarget(null);
    success("Quesito eliminato.");
  }

  async function rebalance() {
    const result = await run("rebalance", () =>
      apiFetch<{ test: SerializedTest; result: { adjustments: string[] } }>(`/api/tests/${test.id}/rebalance`, {
        method: "POST",
        body: { target: test.totalPoints },
      }),
    );
    if (!result) return;
    applyTest(result.test);
    setFeedback({
      tone: "success",
      message: "Punteggi riequilibrati.",
      issues: result.result.adjustments,
    });
  }

  async function changeStatus(status: "bozza" | "approvata") {
    const result = await run(
      "status",
      () =>
        apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/status`, {
          method: "POST",
          body: { status },
        }),
      status === "approvata" ? "Verifica approvata: pronta per l'esportazione." : "Verifica riportata in bozza.",
    );
    if (result) applyTest(result.test);
  }

  async function saveQuickVersion() {
    await run(
      "quick-version",
      () =>
        apiFetch(`/api/tests/${test.id}/versions`, {
          method: "POST",
          body: { label: "Salvataggio rapido" },
        }),
      "Versione salvata.",
    );
  }

  async function duplicateTest() {
    const result = await run("duplicate-test", () =>
      apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/duplicate`, { method: "POST" }),
    );
    if (!result) return;
    router.push(`/verifiche/${result.test.id}`);
  }

  async function createVariant() {
    const result = await run("variant", () =>
      apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/variants`, {
        method: "POST",
        body: { label: variantLabel },
      }),
    );
    if (!result) return;
    setVariantOpen(false);
    router.push(`/verifiche/${result.test.id}`);
  }

  async function deleteTest() {
    const ok = await run("delete-test", async () => {
      await apiFetch(`/api/tests/${test.id}`, { method: "DELETE" });
      return true;
    });
    if (!ok) return;
    setDeleteTestOpen(false);
    router.push("/verifiche");
  }

  async function saveToBank() {
    if (!bankItem) return;
    const result = await run("bank-save", () =>
      apiFetch(`/api/tests/${test.id}/items/${bankItem.id}/bank`, {
        method: "POST",
        body: {
          visibility: bankForm.visibility,
          tags: bankForm.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 15),
          notes: bankForm.notes,
        },
      }),
    );
    if (result === undefined) return;
    setBankItem(null);
    success("Quesito salvato nella banca: sarà riutilizzabile nelle prossime verifiche.");
  }

  const sections = [...test.sections].sort((a, b) => a.order - b.order);
  const sectionIds = new Set(sections.map((section) => section.id));
  const orphanItems = ordered.filter((item) => !item.sectionId || !sectionIds.has(item.sectionId));

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Verifiche", href: "/verifiche" }, { label: test.title }]} />

      {newBanner ? (
        <Notice
          tone="success"
          title="Bozza generata"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setNewBanner(false)}>
              Ho capito
            </Button>
          }
        >
          Rivedi i quesiti uno per uno, controlla soluzioni e criteri, poi approva. Il generatore propone, il docente
          decide: nessuna verifica viene approvata automaticamente.
        </Notice>
      ) : null}

      {!canEdit ? (
        <Notice tone="info" title="Verifica in sola lettura">
          Questa verifica è di {test.authorName}: puoi consultare quesiti, anteprima e griglia, ma non modificarla. Per una
          copia personale usa «Duplica verifica» dalla pagina Verifiche.
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
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {feedback.issues.slice(0, 12).map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
              {feedback.issues.length > 12 ? <li>…e altri {feedback.issues.length - 12} avvisi.</li> : null}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <p className="kicker mb-1.5">Verifica · {test.status === "approvata" ? "approvata" : "bozza"}</p>
          <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">{test.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={test.status} />
            <Badge tone="blue">{subjectLabel(test.subject)}</Badge>
            <Badge tone="neutral">{trackLabel(test.track)}</Badge>
            <Badge tone="neutral">{test.year}ª</Badge>
            {test.classLabel ? <Badge tone="neutral">{test.classLabel}</Badge> : null}
            <Badge tone="violet">versione {test.versionLabel}</Badge>
            {test.isTemplate ? <Badge tone="amber">modello</Badge> : null}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {test.authorName}
            {test.curriculumTitle ? (
              <>
                {" · "}
                <Link href={test.curriculumId ? `/programmi/${test.curriculumId}` : "/programmi"} className="hover:text-foreground">
                  {test.curriculumTitle}
                </Link>
              </>
            ) : (
              " · senza programma collegato"
            )}
            {test.examDate ? ` · prova del ${formatDateIT(test.examDate)}` : ""} · aggiornata {formatDateTimeIT(test.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            test.status === "approvata" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={busy === "status"}
                onClick={() => void changeStatus("bozza")}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Riporta in bozza
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                loading={busy === "status"}
                disabled={blockers.length > 0}
                onClick={() => void changeStatus("approvata")}
                title={blockers.length > 0 ? "Correggi prima gli errori bloccanti" : undefined}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approva
              </Button>
            )
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setTab("anteprima")}>
            <Eye className="h-3.5 w-3.5" />
            Anteprima
          </Button>
          {canEdit ? (
            <>
              <Button type="button" variant="outline" size="sm" loading={busy === "quick-version"} onClick={() => void saveQuickVersion()}>
                <History className="h-3.5 w-3.5" />
                Salva versione
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" />
                Impostazioni
              </Button>
              <details className="relative">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-card px-2 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Altre azioni</span>
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border bg-card p-1 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-muted"
                    onClick={() => void duplicateTest()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplica verifica
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-muted"
                    onClick={() => setVariantOpen(true)}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Crea variante
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteTestOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Elimina verifica
                  </button>
                </div>
              </details>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Punteggio</p>
            <p className="mt-0.5 font-serif text-[22px] font-semibold leading-none">
              {formatPoints(totals.points)} <span className="text-[13px] font-normal text-muted-foreground">/ {formatPoints(test.totalPoints)}</span>
            </p>
          </div>
          <Badge tone={balanced ? "green" : "red"}>{balanced ? "bilanciato" : "da riequilibrare"}</Badge>
        </div>
        <div className="surface flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Tempo</p>
            <p className="mt-0.5 font-serif text-[22px] font-semibold leading-none">
              {totals.minutes} <span className="text-[13px] font-normal text-muted-foreground">/ {test.durationMin} min</span>
            </p>
          </div>
          <Badge tone={timeOk ? "green" : "amber"}>{timeOk ? "in tolleranza" : "fuori tolleranza"}</Badge>
        </div>
        <div className="surface flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Quesiti</p>
            <p className="mt-0.5 font-serif text-[22px] font-semibold leading-none">{test.items.length}</p>
          </div>
          <Badge tone="neutral">{sections.length} {sections.length === 1 ? "sezione" : "sezioni"}</Badge>
        </div>
        <div className="surface flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Blocchi all&apos;approvazione</p>
            <p className="mt-0.5 font-serif text-[22px] font-semibold leading-none">{blockers.length}</p>
          </div>
          <Badge tone={blockers.length === 0 ? "green" : "amber"}>{blockers.length === 0 ? "pronta" : "da correggere"}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1 shadow-sm">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition",
                tab === entry.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {tab === "quesiti" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground">
              {test.items.length} quesiti · {formatPoints(totals.points)} pt · {totals.minutes} min stimati
            </p>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setBankOpen(true)}>
                  <Library className="h-3.5 w-3.5" />
                  Aggiungi dalla banca
                </Button>
              ) : null}
              {canEdit && !balanced ? (
                <Button type="button" size="sm" loading={busy === "rebalance"} onClick={() => void rebalance()}>
                  <Scale className="h-3.5 w-3.5" />
                  Riequilibra punti
                </Button>
              ) : null}
            </div>
          </div>

          {blockers.length > 0 ? (
            <Notice tone="warning" title={`${blockers.length} controlli da sistemare prima dell'approvazione`}>
              <ul className="list-disc space-y-0.5 pl-4">
                {blockers.slice(0, 8).map((blocker, index) => (
                  <li key={index}>{blocker}</li>
                ))}
                {blockers.length > 8 ? <li>…e altri {blockers.length - 8} controlli.</li> : null}
              </ul>
            </Notice>
          ) : (
            <Notice tone="success" title="La verifica supera i controlli di base">
              Punti, tempi, soluzioni e criteri sono presenti. Puoi approvarla e scaricare il pacchetto.
            </Notice>
          )}

          {test.items.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Sparkles className="h-6 w-6" />}
                  title="Nessun quesito"
                  description="Aggiungi un quesito dalla banca oppure torna alla generazione per creare una nuova bozza."
                  action={
                    <Button type="button" size="sm" onClick={() => setBankOpen(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      Aggiungi dalla banca
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          ) : null}

          {sections.map((section) => {
            const sectionItems = ordered.filter((item) => item.sectionId === section.id);
            if (sectionItems.length === 0) return null;
            const sectionPoints = sectionItems.reduce((sum, item) => sum + item.points, 0);
            return (
              <Card key={section.id} className="overflow-hidden">
                <CardHeader
                  title={section.title}
                  description={section.description || undefined}
                  action={
                    <Badge tone="neutral">
                      {sectionItems.length} quesiti · {formatPoints(sectionPoints)} pt
                    </Badge>
                  }
                />
                <div className="space-y-2 bg-muted/20 p-3 sm:p-4">
                  {sectionItems.map((item, sectionIndex) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      index={indexOf.get(item.id) ?? 0}
                      total={ordered.length}
                      canMoveUp={sectionIndex > 0}
                      canMoveDown={sectionIndex < sectionItems.length - 1}
                      topics={topics}
                      canEdit={canEdit}
                      onSave={saveItem}
                      onDelete={setDeleteItemTarget}
                      onDuplicate={duplicateItem}
                      onRegenerate={regenerateItem}
                      onToggleLock={toggleLock}
                      onSaveToBank={(entry) => {
                        setBankItem(entry);
                        setBankForm({ visibility: "dipartimento", tags: "", notes: "" });
                      }}
                      onMove={moveItem}
                    />
                  ))}
                </div>
              </Card>
            );
          })}

          {orphanItems.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="Altri quesiti"
                description="Quesiti senza una sezione assegnata: compaiono in coda all'esportazione."
                action={<Badge tone="neutral">{orphanItems.length}</Badge>}
              />
              <div className="space-y-2 bg-muted/20 p-3 sm:p-4">
                {orphanItems.map((item, orphanIndex) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    index={indexOf.get(item.id) ?? 0}
                    total={ordered.length}
                    canMoveUp={orphanIndex > 0}
                    canMoveDown={orphanIndex < orphanItems.length - 1}
                    topics={topics}
                    canEdit={canEdit}
                    onSave={saveItem}
                    onDelete={setDeleteItemTarget}
                    onDuplicate={duplicateItem}
                    onRegenerate={regenerateItem}
                    onToggleLock={toggleLock}
                    onSaveToBank={(entry) => {
                      setBankItem(entry);
                      setBankForm({ visibility: "dipartimento", tags: "", notes: "" });
                    }}
                    onMove={moveItem}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {canEdit && balanced && test.items.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Se modifichi i punti di un quesito, il totale cambia: usa «Riequilibra punti» per riallinearlo a{" "}
              {formatPoints(test.totalPoints)} pt.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "anteprima" ? <PreviewPanel testId={test.id} onError={fail} /> : null}

      {tab === "griglia" ? (
        <RubricPanel
          key={rubricKey}
          test={test}
          gradeScales={gradeScales}
          canEdit={canEdit}
          onTestUpdate={applyTest}
          onError={fail}
          onSuccess={success}
        />
      ) : null}

      {tab === "versioni" ? (
        <VersionsPanel
          testId={test.id}
          canEdit={canEdit}
          onRestore={applyTest}
          onError={fail}
          onSuccess={success}
        />
      ) : null}

      {tab === "esporta" ? <ExportPanel testId={test.id} onError={fail} onSuccess={success} /> : null}

      <SettingsModal
        open={settingsOpen}
        test={test}
        onClose={() => setSettingsOpen(false)}
        onSaved={(next, suggestion) => {
          applyTest(next);
          if (suggestion) setFeedback({ tone: "warning", message: suggestion });
        }}
        onError={fail}
        onSuccess={success}
      />

      <BankPicker
        open={bankOpen}
        testId={test.id}
        onClose={() => setBankOpen(false)}
        onAdded={(next) => {
          applyTest(next);
          setFeedback({
            tone: "warning",
            message: "Quesito aggiunto dalla banca. Usa «Riequilibra punti» per riallineare il totale.",
          });
        }}
        onError={fail}
      />

      <Modal
        open={Boolean(deleteItemTarget)}
        onClose={() => setDeleteItemTarget(null)}
        title="Eliminare questo quesito?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteItemTarget(null)}>
              Annulla
            </Button>
            <Button type="button" variant="danger" loading={busy === "delete-item"} onClick={() => void confirmDeleteItem()}>
              <Trash2 className="h-3.5 w-3.5" />
              Elimina quesito
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {deleteItemTarget?.prompt.slice(0, 220)}
          {deleteItemTarget && deleteItemTarget.prompt.length > 220 ? "…" : ""}
        </p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          L&apos;eliminazione crea una nuova versione: potrai ripristinare lo stato precedente dalla scheda Versioni.
        </p>
      </Modal>

      <Modal
        open={Boolean(bankItem)}
        onClose={() => setBankItem(null)}
        title="Salva nella banca quesiti"
        description="Il quesito conserva testo, soluzione, criteri e punti. Potrai riutilizzarlo in altre verifiche."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setBankItem(null)}>
              Annulla
            </Button>
            <Button type="button" loading={busy === "bank-save"} onClick={() => void saveToBank()}>
              <Library className="h-3.5 w-3.5" />
              Salva nella banca
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="line-clamp-4 rounded-lg border bg-muted/30 px-3 py-2.5 text-[12.5px]">{bankItem?.prompt}</p>
          <Field label="Visibilità">
            <Select
              value={bankForm.visibility}
              onChange={(event) => setBankForm((prev) => ({ ...prev, visibility: event.target.value }))}
            >
              {VISIBILITIES.map((visibility) => (
                <option key={visibility.value} value={visibility.value}>
                  {visibility.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tag" hint="Separati da virgola. Materia, indirizzo e anno vengono aggiunti automaticamente.">
            <Input
              value={bankForm.tags}
              onChange={(event) => setBankForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="derivate, verifica di competenza…"
            />
          </Field>
          <Field label="Note">
            <Textarea
              value={bankForm.notes}
              rows={3}
              onChange={(event) => setBankForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Indicazioni d'uso, varianti, livello di difficoltà…"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={variantOpen}
        onClose={() => setVariantOpen(false)}
        title="Crea una variante"
        description="Genera una nuova verifica con lo stesso impianto e numeri diversi, utile per file affiancate."
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setVariantOpen(false)}>
              Annulla
            </Button>
            <Button type="button" loading={busy === "variant"} onClick={() => void createVariant()}>
              <GitBranch className="h-3.5 w-3.5" />
              Genera variante
            </Button>
          </>
        }
      >
        <Field label="Etichetta variante">
          <Select value={variantLabel} onChange={(event) => setVariantLabel(event.target.value as "A" | "B" | "C" | "D")}>
            {(["A", "B", "C", "D"] as const).map((label) => (
              <option key={label} value={label}>
                Versione {label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          La variante è una nuova verifica collegata a questa. Potrai modificarla e approvarla separatamente.
        </p>
      </Modal>

      <Modal
        open={deleteTestOpen}
        onClose={() => setDeleteTestOpen(false)}
        title="Eliminare la verifica?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteTestOpen(false)}>
              Annulla
            </Button>
            <Button type="button" variant="danger" loading={busy === "delete-test"} onClick={() => void deleteTest()}>
              <Trash2 className="h-3.5 w-3.5" />
              Elimina definitivamente
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] leading-relaxed text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          La verifica, i quesiti e lo storico versioni verranno eliminati. L&apos;operazione non è reversibile. Le voci
          già salvate nella banca quesiti restano disponibili.
        </p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">Autore: {test.authorName}</p>
      </Modal>
    </div>
  );
}
