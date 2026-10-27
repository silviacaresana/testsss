"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Library,
  Pencil,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { SerializedBankEntry } from "@/lib/bank/service";
import { apiFetch, ApiError } from "@/lib/client/api";
import { cn, formatDateIT } from "@/lib/utils";
import { itemTypeLabel, labelFor, VISIBILITIES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";

type Feedback = { tone: "success" | "error"; message: string };

export function BankBrowser({
  initialEntries,
  tags,
  currentUserId,
  isAdmin,
}: {
  initialEntries: SerializedBankEntry[];
  tags: string[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [q, setQ] = useState("");
  const [visibility, setVisibility] = useState("");
  const [tag, setTag] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [editing, setEditing] = useState<SerializedBankEntry | null>(null);
  const [editForm, setEditForm] = useState({ visibility: "dipartimento", tags: "", notes: "" });
  const [deleting, setDeleting] = useState<SerializedBankEntry | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageSize = 12;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((entry) => {
      if (visibility && entry.visibility !== visibility) return false;
      if (tag && !entry.tags.includes(tag)) return false;
      if (mine && entry.ownerId !== currentUserId) return false;
      if (!needle) return true;
      const haystack = [entry.prompt, entry.notes, entry.ownerName, ...entry.tags, ...entry.solutionSteps]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, q, visibility, tag, mine, currentUserId]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(q || visibility || tag || mine);

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setQ("");
    setVisibility("");
    setTag("");
    setMine(false);
    setPage(1);
  }

  function replaceEntry(next: SerializedBankEntry) {
    setEntries((prev) => prev.map((entry) => (entry.id === next.id ? next : entry)));
  }

  async function rate(entry: SerializedBankEntry, value: number) {
    setBusy(`rate-${entry.id}`);
    setFeedback(null);
    try {
      const result = await apiFetch<{ entry: SerializedBankEntry }>(`/api/bank/${entry.id}/rating`, {
        method: "POST",
        body: { rating: value },
      });
      replaceEntry(result.entry);
      setFeedback({ tone: "success", message: "Valutazione registrata." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Valutazione non riuscita.",
      });
    } finally {
      setBusy(null);
    }
  }

  function openEdit(entry: SerializedBankEntry) {
    setEditing(entry);
    setEditForm({ visibility: entry.visibility, tags: entry.tags.join(", "), notes: entry.notes });
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(`edit-${editing.id}`);
    setFeedback(null);
    try {
      const result = await apiFetch<{ entry: SerializedBankEntry }>(`/api/bank/${editing.id}`, {
        method: "PATCH",
        body: {
          visibility: editForm.visibility,
          tags: editForm.tags
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 20),
          notes: editForm.notes,
        },
      });
      replaceEntry(result.entry);
      setEditing(null);
      setFeedback({ tone: "success", message: "Quesito aggiornato." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Modifica non riuscita.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(`delete-${deleting.id}`);
    setFeedback(null);
    try {
      await apiFetch(`/api/bank/${deleting.id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((entry) => entry.id !== deleting.id));
      setDeleting(null);
      setFeedback({ tone: "success", message: "Quesito rimosso dalla banca." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Eliminazione non riuscita.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.9fr_0.8fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                resetPage();
              }}
              placeholder="Cerca nel testo, nelle soluzioni o nei tag"
              className="pl-9"
              aria-label="Cerca nella banca"
            />
          </div>
          <Select
            value={visibility}
            onChange={(event) => {
              setVisibility(event.target.value);
              resetPage();
            }}
            aria-label="Visibilità"
          >
            <option value="">Ogni visibilità</option>
            {VISIBILITIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
          <Select
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
              resetPage();
            }}
            aria-label="Tag"
          >
            <option value="">Ogni tag</option>
            {tags.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <label className="flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-[12.5px]">
            <input
              type="checkbox"
              checked={mine}
              onChange={(event) => {
                setMine(event.target.checked);
                resetPage();
              }}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            Solo miei
          </label>
          {hasFilters ? (
            <Button type="button" variant="outline" onClick={clearFilters} aria-label="Azzera filtri">
              <X className="h-4 w-4" />
              Azzera
            </Button>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>
      </Card>

      {feedback ? (
        <Notice tone={feedback.tone} action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setFeedback(null)}>
            Chiudi
          </Button>
        }>
          {feedback.message}
        </Notice>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<Library className="h-6 w-6" />}
              title={hasFilters ? "Nessun quesito corrisponde ai filtri" : "La banca è ancora vuota"}
              description={
                hasFilters
                  ? "Prova a rimuovere un filtro: la banca mostra i quesiti privati solo al proprietario e quelli di dipartimento a tutti i docenti."
                  : "Salva un quesito dalla scheda di una verifica: resterà disponibile qui con soluzione, criteri e punti."
              }
              action={
                hasFilters ? (
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                    Azzera filtri
                  </Button>
                ) : null
              }
            />
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <span>
              {filtered.length} {filtered.length === 1 ? "quesito" : "quesiti"}
              {hasFilters ? " con i filtri attivi" : ""}
            </span>
            <span>
              Pagina {safePage} di {pages}
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((entry) => {
              const canEdit = isAdmin || entry.ownerId === currentUserId;
              const isOpen = expanded === entry.id;
              return (
                <Card key={entry.id} className="flex flex-col">
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="blue">{itemTypeLabel(entry.type)}</Badge>
                      <Badge tone="neutral">{entry.points} pt</Badge>
                      <Badge tone="neutral">difficoltà {entry.difficulty}/5</Badge>
                      <Badge tone={entry.visibility === "privato" ? "amber" : "green"}>
                        {labelFor(VISIBILITIES, entry.visibility)}
                      </Badge>
                      {entry.usageCount > 0 ? <Badge tone="violet">usato {entry.usageCount}×</Badge> : null}
                    </div>
                    <p className={cn("mt-2.5 whitespace-pre-line text-[13.5px] leading-relaxed", !isOpen && "line-clamp-5")}>
                      {entry.prompt}
                    </p>

                    {isOpen ? (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        {entry.options.length > 0 ? (
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Opzioni</p>
                            <ol className="mt-1 space-y-1 text-[12.5px]">
                              {entry.options.map((option, index) => (
                                <li
                                  key={index}
                                  className={cn(
                                    "rounded-md border px-2 py-1",
                                    entry.correctOption === index && "border-emerald-200 bg-emerald-50",
                                  )}
                                >
                                  {String.fromCharCode(65 + index)}. {option}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                        <div>
                          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Soluzione</p>
                          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12.5px] leading-relaxed">
                            {entry.solutionSteps.map((step, index) => (
                              <li key={index}>{step}</li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Criteri</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed">
                            {entry.gradingCriteria.map((criterion, index) => (
                              <li key={index}>{criterion}</li>
                            ))}
                          </ul>
                        </div>
                        {entry.notes ? (
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Note</p>
                            <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed">{entry.notes}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {entry.tags.map((value) => (
                        <span key={value} className="rounded-full bg-muted px-2 py-0.5">
                          #{value}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/25 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center" aria-label={`Valutazione media ${entry.rating.toFixed(1)} su 5`}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={busy === `rate-${entry.id}`}
                            onClick={() => void rate(entry, value)}
                            className="p-0.5 text-amber-500 transition hover:scale-110 disabled:opacity-50"
                            title={`Valuta ${value} su 5`}
                          >
                            <Star
                              className={cn("h-3.5 w-3.5", value <= Math.round(entry.rating) ? "fill-current" : "opacity-30")}
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {entry.ratingCount > 0 ? `${entry.rating.toFixed(1)} (${entry.ratingCount})` : "nessuna valutazione"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setExpanded(isOpen ? null : entry.id)}
                      >
                        {isOpen ? "Riduci" : "Dettagli"}
                      </button>
                      {entry.sourceTestId ? (
                        <Link
                          href={`/verifiche/${entry.sourceTestId}`}
                          className="rounded-md px-2 py-1 text-[11.5px] font-medium text-primary hover:bg-primary/10"
                        >
                          Verifica
                        </Link>
                      ) : null}
                      {canEdit ? (
                        <>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => openEdit(entry)}
                            aria-label="Modifica quesito"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                            onClick={() => setDeleting(entry)}
                            aria-label="Elimina quesito"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <p className="border-t px-4 py-1.5 text-[10.5px] text-muted-foreground">
                    {entry.ownerName} · {formatDateIT(entry.createdAt)}
                    {entry.estimatedMin > 0 ? ` · ${entry.estimatedMin} min stimati` : ""}
                  </p>
                </Card>
              );
            })}
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                Precedente
              </Button>
              <span className="text-[12px] text-muted-foreground">
                {safePage} / {pages}
              </span>
              <Button type="button" variant="outline" size="sm" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
                Successiva
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Modifica quesito della banca"
        description="Visibilità e tag aiutano i colleghi a ritrovare il quesito. Il testo e la soluzione restano quelli salvati."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Annulla
            </Button>
            <Button type="button" loading={busy === `edit-${editing?.id}`} onClick={() => void saveEdit()}>
              Salva modifiche
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Visibilità" hint="«Privato» è visibile solo a te e agli amministratori.">
            <Select
              value={editForm.visibility}
              onChange={(event) => setEditForm((prev) => ({ ...prev, visibility: event.target.value }))}
            >
              {VISIBILITIES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tag" hint="Separati da virgola.">
            <Input
              value={editForm.tags}
              onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="derivate, problemi, recupero…"
            />
          </Field>
          <Field label="Note">
            <Textarea
              rows={4}
              value={editForm.notes}
              onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Indicazioni per il riuso, livello, varianti…"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Rimuovere il quesito dalla banca?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
              Annulla
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy === `delete-${deleting?.id}`}
              onClick={() => void confirmDelete()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Rimuovi
            </Button>
          </>
        }
      >
        <p className="line-clamp-5 text-[13px] leading-relaxed text-muted-foreground">{deleting?.prompt}</p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Le verifiche che hanno già usato questo quesito non vengono modificate.
        </p>
      </Modal>
    </div>
  );
}
