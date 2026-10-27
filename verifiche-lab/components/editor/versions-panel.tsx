"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedTest } from "@/lib/tests/repository";
import { formatDateTimeIT } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";

interface Version {
  id: string;
  version: number;
  label: string;
  createdAt: string;
  authorName: string;
}

export function VersionsPanel({
  testId,
  canEdit,
  onRestore,
  onError,
  onSuccess,
}: {
  testId: string;
  canEdit: boolean;
  onRestore: (test: SerializedTest) => void;
  onError: (message: string, issues?: string[]) => void;
  onSuccess: (message: string) => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<Version | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ versions: Version[] }>(`/api/tests/${testId}/versions`);
      setVersions(data.versions);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Impossibile caricare le versioni.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveVersion() {
    setSaving(true);
    try {
      await apiFetch(`/api/tests/${testId}/versions`, {
        method: "POST",
        body: { label: label.trim() || undefined },
      });
      setLabel("");
      await load();
      onSuccess("Versione salvata: puoi ripristinarla in qualsiasi momento.");
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Impossibile salvare la versione.");
    } finally {
      setSaving(false);
    }
  }

  async function restore() {
    if (!target) return;
    setRestoring(true);
    try {
      const data = await apiFetch<{ test: SerializedTest }>(`/api/tests/${testId}/versions/${target.id}/restore`, {
        method: "POST",
      });
      onRestore(data.test);
      setTarget(null);
      await load();
      onSuccess(`Ripristinata la versione ${target.version}. La verifica è tornata in bozza.`);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Impossibile ripristinare la versione.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-5">
      <Notice tone="info" title="Come funziona lo storico">
        Ogni modifica automatica (quesiti, punti, griglia, approvazione) crea un&apos;istantanea. Puoi anche salvare un
        punto di ripristino con un&apos;etichetta. Il ripristino non cancella lo storico: aggiunge una nuova versione.
      </Notice>

      {canEdit ? (
        <Card>
          <CardHeader title="Salva un punto di ripristino" icon={<Save className="h-4 w-4" />} />
          <CardBody>
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void saveVersion();
              }}
            >
              <Field label="Etichetta (facoltativa)" className="flex-1">
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={120}
                  placeholder="Es. Prima della revisione del dipartimento"
                />
              </Field>
              <Button type="submit" loading={saving}>
                {saving ? null : <Save className="h-3.5 w-3.5" />}
                Salva versione
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Storico versioni"
          description={`${versions.length} ${versions.length === 1 ? "istantanea" : "istantanee"} · dalla più recente`}
          icon={<History className="h-4 w-4" />}
        />
        {loading ? (
          <CardBody>
            <p className="py-6 text-center text-[13px] text-muted-foreground">Carico lo storico…</p>
          </CardBody>
        ) : versions.length === 0 ? (
          <CardBody>
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nessuna versione ancora. Salva un punto di ripristino prima di una revisione importante.
            </p>
          </CardBody>
        ) : (
          <div className="divide-y">
            {versions.map((version) => (
              <div key={version.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.06] text-[11px] font-bold text-primary">
                  v{version.version}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{version.label || "Istantanea"}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateTimeIT(version.createdAt)} · {version.authorName}
                  </p>
                </div>
                {version.version === versions[0]?.version ? <Badge tone="green">più recente</Badge> : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => setTarget(version)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Ripristina
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        Lo storico è privato: è visibile solo all&apos;autore della verifica e agli amministratori del dipartimento. Il
        ripristino riporta la verifica allo stato «bozza» e richiede una nuova approvazione.
      </p>

      <Modal
        open={Boolean(target)}
        onClose={() => (restoring ? undefined : setTarget(null))}
        title={`Ripristinare la versione ${target?.version ?? ""}?`}
        description={target ? `${target.label || "Istantanea"} · ${formatDateTimeIT(target.createdAt)}` : undefined}
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" disabled={restoring} onClick={() => setTarget(null)}>
              Annulla
            </Button>
            <Button type="button" variant="danger" loading={restoring} onClick={() => void restore()}>
              {restoring ? null : <RotateCcw className="h-3.5 w-3.5" />}
              Ripristina versione
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          I quesiti, le sezioni e la griglia attuali verranno sostituiti dall&apos;istantanea scelta. L&apos;operazione crea
          una nuova versione, quindi non perdi definitivamente il lavoro corrente.
        </p>
      </Modal>
    </div>
  );
}
