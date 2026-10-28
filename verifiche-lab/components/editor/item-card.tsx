"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import type { SerializedItem } from "@/lib/tests/repository";
import { ANSWER_SPACES, DIFFICULTY_TABLE, ITEM_TYPES, itemTypeLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { formatPoints, itemToForm, splitLines, type ItemFormState, type TopicOption } from "@/components/editor/types";

const TYPE_TONE: Record<string, "green" | "amber" | "red" | "blue" | "violet" | "neutral"> = {
  multiple_choice: "blue",
  true_false: "blue",
  short_answer: "green",
  open_answer: "green",
  exercise: "violet",
  problem: "violet",
  graph: "amber",
  lab_data: "amber",
  proof: "red",
};

function IconButton({
  label,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ItemCard({
  item,
  index,
  total,
  canMoveUp,
  canMoveDown,
  topics,
  canEdit,
  onSave,
  onDelete,
  onDuplicate,
  onRegenerate,
  onToggleLock,
  onMove,
}: {
  item: SerializedItem;
  index: number;
  total: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  topics: TopicOption[];
  canEdit: boolean;
  onSave: (itemId: string, patch: Record<string, unknown>) => Promise<boolean>;
  onDelete: (item: SerializedItem) => void;
  onDuplicate: (item: SerializedItem) => Promise<boolean>;
  onRegenerate: (item: SerializedItem) => Promise<boolean>;
  onToggleLock: (item: SerializedItem) => Promise<boolean>;
  onMove: (item: SerializedItem, direction: -1 | 1) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(index === 0);
  const [form, setForm] = useState<ItemFormState>(() => itemToForm(item));
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) setForm(itemToForm(item));
  }, [item, dirty]);

  const optionsVisible = form.type === "multiple_choice" || form.type === "true_false";
  const disabled = !canEdit || item.isLocked;

  const indicator = useMemo(() => {
    const dots = "●".repeat(item.difficulty) + "○".repeat(5 - item.difficulty);
    return `${dots} · ${DIFFICULTY_TABLE[item.difficulty - 1]?.label ?? "Difficoltà " + item.difficulty}`;
  }, [item.difficulty]);

  function update<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setDirty(true);
    setLocalError(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeType(next: string) {
    setDirty(true);
    setLocalError(null);
    setForm((prev) => {
      let options = prev.options;
      let correctOption = prev.correctOption;
      if (next === "true_false") {
        options = ["Vero", "Falso"];
        correctOption = prev.correctOption !== null && prev.correctOption < 2 ? prev.correctOption : 0;
      } else if (next === "multiple_choice") {
        options = Array.from({ length: Math.max(4, prev.options.length) }, (_, i) => prev.options[i] ?? "");
        correctOption =
          prev.correctOption !== null && prev.correctOption < options.length ? prev.correctOption : null;
      } else {
        correctOption = null;
      }
      return { ...prev, type: next, options, correctOption };
    });
  }

  async function save() {
    if (form.prompt.trim().length < 3) {
      setLocalError("Il testo del quesito deve avere almeno 3 caratteri.");
      return;
    }
    if (form.points < 0.25) {
      setLocalError("Il punteggio minimo è 0,25.");
      return;
    }
    if (optionsVisible) {
      if (form.options.some((option) => option.trim().length === 0)) {
        setLocalError("Compila tutte le opzioni oppure rimuovi quelle vuote.");
        return;
      }
      if (form.correctOption === null) {
        setLocalError("Indica la risposta corretta.");
        return;
      }
    }
    setWorking("save");
    setLocalError(null);
    const ok = await onSave(item.id, {
      type: form.type,
      prompt: form.prompt.trim(),
      options: optionsVisible ? form.options.map((option) => option.trim()) : [],
      correctOption: optionsVisible ? form.correctOption : null,
      points: form.points,
      difficulty: form.difficulty,
      estimatedMin: form.estimatedMin,
      topicId: form.topicId || null,
      answerSpace: form.answerSpace,
      solutionSteps: splitLines(form.solutionStepsText),
      gradingCriteria: splitLines(form.gradingCriteriaText),
      commonErrors: splitLines(form.commonErrorsText),
      hints: splitLines(form.hintsText),
      notes: form.notes,
    });
    setWorking(null);
    if (ok) {
      setDirty(false);
      setOpen(false);
    }
  }

  async function runAction(label: string, action: () => Promise<boolean>) {
    setWorking(label);
    setLocalError(null);
    try {
      await action();
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm transition", open ? "border-primary/35" : "hover:border-primary/25")}>
      <div className="flex items-start gap-3 px-3.5 py-3 sm:px-4">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold",
            item.isLocked
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-primary/20 bg-primary/[0.06] text-primary",
          )}
        >
          {index + 1}
        </span>

        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={TYPE_TONE[item.type] ?? "neutral"}>{itemTypeLabel(item.type)}</Badge>
            <Badge tone="green">{formatPoints(item.points)} pt</Badge>
            <span className="text-[11px] text-muted-foreground">{item.estimatedMin} min</span>
            {item.isLocked ? (
              <Badge tone="amber" className="gap-1">
                <Lock className="h-2.5 w-2.5" /> bloccato
              </Badge>
            ) : null}
            {item.source === "banca" ? <Badge tone="violet">banca</Badge> : null}
            {item.aiGenerated && item.source !== "manuale" ? <Badge tone="neutral">AI</Badge> : null}
          </div>
          <p className={cn("mt-1.5 text-[13.5px] leading-snug", !open && "line-clamp-2")}>{item.prompt}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{indicator}</span>
            {item.topicName ? <span>· {item.topicCode ? `${item.topicCode} ` : ""}{item.topicName}</span> : null}
            {item.variantGroup ? <span>· variante {item.variantGroup}</span> : null}
          </p>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Chiudi quesito" : "Apri quesito"}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <div className="flex flex-wrap justify-end gap-1">
            <IconButton
              label="Sposta su"
              disabled={!canEdit || !(canMoveUp ?? index > 0) || Boolean(working)}
              onClick={() => void runAction("up", () => onMove(item, -1))}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Sposta giù"
              disabled={!canEdit || !(canMoveDown ?? index < total - 1) || Boolean(working)}
              onClick={() => void runAction("down", () => onMove(item, 1))}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Duplica quesito"
              disabled={!canEdit || Boolean(working)}
              onClick={() => void runAction("duplicate", () => onDuplicate(item))}
            >
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label="Rigenera quesito"
              disabled={!canEdit || item.isLocked || Boolean(working)}
              onClick={() => {
                if (window.confirm("Rigenerare il quesito? Testo, soluzione e criteri verranno sostituiti.")) {
                  void runAction("regenerate", () => onRegenerate(item));
                }
              }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", working === "regenerate" && "animate-spin")} />
            </IconButton>
            <IconButton
              label={item.isLocked ? "Sblocca quesito" : "Blocca quesito"}
              disabled={!canEdit || Boolean(working)}
              onClick={() => void runAction("lock", () => onToggleLock(item))}
            >
              {item.isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton
              label="Elimina quesito"
              disabled={!canEdit || total <= 1 || Boolean(working)}
              onClick={() => onDelete(item)}
              className="hover:border-red-300 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border/70 bg-muted/20 px-3.5 py-4 sm:px-4">
          {!canEdit ? (
            <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-900">
              Verifica in sola lettura: non sei l&apos;autore.
            </p>
          ) : item.isLocked ? (
            <p className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <Lock className="h-3.5 w-3.5" />
              Quesito bloccato: sbloccalo per modificarne il contenuto.
            </p>
          ) : null}

          <Field label="Testo del quesito" hint="Puoi usare formule LaTeX tra $...$; verranno compilate nell'esportazione.">
            <Textarea
              value={form.prompt}
              onChange={(event) => update("prompt", event.target.value)}
              rows={3}
              disabled={disabled}
            />
          </Field>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tipologia">
              <Select value={form.type} onChange={(event) => changeType(event.target.value)} disabled={disabled}>
                {ITEM_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Punteggio" hint="Multipli di 0,25">
              <Input
                type="number"
                min={0.25}
                step={0.25}
                value={form.points}
                onChange={(event) => update("points", Number(event.target.value))}
                disabled={disabled}
              />
            </Field>
            <Field label="Tempo stimato (min)">
              <Input
                type="number"
                min={1}
                max={60}
                value={form.estimatedMin}
                onChange={(event) => update("estimatedMin", Number(event.target.value))}
                disabled={disabled}
              />
            </Field>
            <Field label="Difficoltà">
              <Select
                value={String(form.difficulty)}
                onChange={(event) => update("difficulty", Number(event.target.value))}
                disabled={disabled}
              >
                {DIFFICULTY_TABLE.map((level) => (
                  <option key={level.level} value={level.level}>
                    {level.level} · {level.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Argomento del programma">
              <Select value={form.topicId} onChange={(event) => update("topicId", event.target.value)} disabled={disabled}>
                <option value="">Nessun argomento</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.code} · {topic.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Spazio risposta">
              <Select
                value={form.answerSpace}
                onChange={(event) => update("answerSpace", event.target.value)}
                disabled={disabled}
              >
                {ANSWER_SPACES.map((space) => (
                  <option key={space.value} value={space.value}>
                    {space.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {optionsVisible ? (
            <div className="mt-3 rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium">Opzioni e risposta corretta</p>
                {form.type === "multiple_choice" && form.options.length < 8 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => update("options", [...form.options, ""])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Aggiungi opzione
                  </Button>
                ) : null}
              </div>
              <div className="space-y-2">
                {form.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${item.id}`}
                      checked={form.correctOption === optionIndex}
                      onChange={() => update("correctOption", optionIndex)}
                      disabled={disabled}
                      aria-label={`Risposta corretta: opzione ${optionIndex + 1}`}
                      className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <span className="w-4 text-[11px] font-semibold text-muted-foreground">
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <Input
                      value={option}
                      onChange={(event) => {
                        const next = [...form.options];
                        next[optionIndex] = event.target.value;
                        update("options", next);
                      }}
                      disabled={disabled}
                    />
                    {form.options.length > 2 && form.type === "multiple_choice" ? (
                      <IconButton
                        label="Rimuovi opzione"
                        disabled={disabled}
                        onClick={() => {
                          const next = form.options.filter((_, i) => i !== optionIndex);
                          setForm((prev) => ({
                            ...prev,
                            options: next,
                            correctOption:
                              prev.correctOption === null
                                ? null
                                : prev.correctOption === optionIndex
                                  ? null
                                  : prev.correctOption > optionIndex
                                    ? prev.correctOption - 1
                                    : prev.correctOption,
                          }));
                          setDirty(true);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    ) : null}
                  </div>
                ))}
              </div>
              {form.correctOption === null ? (
                <p className="mt-2 text-[11px] text-amber-700">Seleziona l&apos;opzione corretta per poter approvare la verifica.</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Field
              label="Soluzione svolta"
              hint="Un passaggio per riga. Obbligatoria per l'approvazione."
              className="lg:col-span-1"
            >
              <Textarea
                value={form.solutionStepsText}
                onChange={(event) => update("solutionStepsText", event.target.value)}
                rows={4}
                disabled={disabled}
                placeholder={"Passaggio 1…\nPassaggio 2…\nRisultato finale."}
              />
            </Field>
            <Field label="Criteri di punteggio" hint="Un criterio per riga, con eventuale frazione di punteggio.">
              <Textarea
                value={form.gradingCriteriaText}
                onChange={(event) => update("gradingCriteriaText", event.target.value)}
                rows={4}
                disabled={disabled}
                placeholder={"Impostazione corretta: 2 pt\nCalcolo: 1 pt\nMotivazione: 1 pt"}
              />
            </Field>
          </div>

          <details className="mt-3 rounded-lg border bg-card px-3 py-2">
            <summary className="cursor-pointer text-[12.5px] font-medium text-muted-foreground">
              Errori frequenti, suggerimenti e note interne
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <Field label="Errori frequenti">
                <Textarea
                  value={form.commonErrorsText}
                  onChange={(event) => update("commonErrorsText", event.target.value)}
                  rows={3}
                  disabled={disabled}
                />
              </Field>
              <Field label="Suggerimenti">
                <Textarea
                  value={form.hintsText}
                  onChange={(event) => update("hintsText", event.target.value)}
                  rows={3}
                  disabled={disabled}
                />
              </Field>
              <Field label="Note interne">
                <Textarea
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  rows={3}
                  disabled={disabled}
                />
              </Field>
            </div>
          </details>

          {localError ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-800">
              {localError}
            </p>
          ) : null}

          {canEdit ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <p className="text-[11px] text-muted-foreground">
                {item.isLocked
                  ? "Sblocca il quesito per salvare le modifiche."
                  : dirty
                    ? "Modifiche non salvate."
                    : "Nessuna modifica da salvare."}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!dirty || disabled || Boolean(working)}
                  onClick={() => {
                    setForm(itemToForm(item));
                    setDirty(false);
                    setLocalError(null);
                  }}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || disabled || Boolean(working)}
                  loading={working === "save"}
                  onClick={() => void save()}
                >
                  {working === "save" ? null : <Save className="h-3.5 w-3.5" />}
                  Salva quesito
                </Button>
              </div>
            </div>
          ) : null}

          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {item.aiGenerated ? "Generato dal motore" : "Inserito manualmente"} · origine {item.source}
            {item.variantGroup ? ` · gruppo variante ${item.variantGroup}` : ""}
            {item.objectives.length > 0 ? ` · ${item.objectives.length} obiettivi collegati` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
