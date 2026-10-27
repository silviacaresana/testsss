"use client";

import { useEffect, useState } from "react";
import { Library, Plus, Search, Star } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedTest } from "@/lib/tests/repository";
import { itemTypeLabel } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { formatPoints } from "@/components/editor/types";

interface BankEntry {
  id: string;
  prompt: string;
  type: string;
  points: number;
  difficulty: number;
  estimatedMin: number;
  tags: string[];
  ownerName: string;
  rating: number;
  usageCount: number;
}

export function BankPicker({
  open,
  testId,
  onClose,
  onAdded,
  onError,
}: {
  open: boolean;
  testId: string;
  onClose: () => void;
  onAdded: (test: SerializedTest) => void;
  onError: (message: string, issues?: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function load(search: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "40" });
      if (search.trim()) params.set("q", search.trim());
      const data = await apiFetch<{ entries: BankEntry[] }>(`/api/bank?${params.toString()}`);
      setEntries(data.entries);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Impossibile caricare la banca quesiti.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function add(entry: BankEntry) {
    setAdding(entry.id);
    try {
      const data = await apiFetch<{ test: SerializedTest }>(`/api/tests/${testId}/items`, {
        method: "POST",
        body: { entryId: entry.id },
      });
      onAdded(data.test);
      onClose();
    } catch (error) {
      onError(
        error instanceof ApiError ? error.message : "Impossibile aggiungere il quesito.",
        error instanceof ApiError ? error.issues : undefined,
      );
    } finally {
      setAdding(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aggiungi dalla banca quesiti"
      description="Scegli un quesito riutilizzabile: punti, tempo e soluzione vengono copiati nella verifica."
      size="lg"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Chiudi
        </Button>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per testo, nota o tag…"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" loading={loading}>
          Cerca
        </Button>
      </form>

      <Notice tone="info" className="mt-3">
        Dopo l&apos;inserimento, usa «Riequilibra punti» nella scheda Quesiti per riallineare il totale.
      </Notice>

      <div className="mt-4 space-y-2.5">
        {loading ? <p className="py-6 text-center text-[13px] text-muted-foreground">Carico la banca quesiti…</p> : null}
        {!loading && entries.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <Library className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-[13px] font-medium">Nessun quesito trovato</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Salva un quesito dalla verifica con l&apos;icona della biblioteca, oppure crea una voce dalla pagina Banca.
            </p>
          </div>
        ) : null}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border bg-card p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="violet">{itemTypeLabel(entry.type)}</Badge>
              <Badge tone="green">{formatPoints(entry.points)} pt</Badge>
              <span className="text-[11px] text-muted-foreground">{entry.estimatedMin} min</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {entry.rating > 0 ? entry.rating.toFixed(1) : "—"} · usato {entry.usageCount} volte
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">{entry.ownerName}</span>
            </div>
            <p className="mt-2 line-clamp-3 text-[13px] leading-snug">{entry.prompt}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {entry.tags.slice(0, 6).map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] text-muted-foreground">
                  {tag}
                </span>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                loading={adding === entry.id}
                disabled={Boolean(adding)}
                onClick={() => void add(entry)}
              >
                {adding === entry.id ? null : <Plus className="h-3.5 w-3.5" />}
                Aggiungi
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
