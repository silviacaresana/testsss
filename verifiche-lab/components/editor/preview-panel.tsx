"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

type PreviewKind = "verifica" | "soluzioni" | "griglia";

const KINDS: { value: PreviewKind; label: string; hint: string }[] = [
  { value: "verifica", label: "Verifica", hint: "Foglio da consegnare" },
  { value: "soluzioni", label: "Soluzioni", hint: "Svolgimenti e criteri" },
  { value: "griglia", label: "Griglia", hint: "Indicatori e voti" },
];

interface PreviewCheck {
  ok: boolean;
  engineAvailable: boolean;
  log: string;
  kind: string;
}

export function PreviewPanel({
  testId,
  onError,
}: {
  testId: string;
  onError: (message: string, issues?: string[]) => void;
}) {
  const [kind, setKind] = useState<PreviewKind>("verifica");
  const [nonce, setNonce] = useState(0);
  const [check, setCheck] = useState<PreviewCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const checkPreview = useCallback(async () => {
    setLoading(true);
    setCheck(null);
    try {
      const data = await apiFetch<PreviewCheck>(`/api/tests/${testId}/preview?kind=${kind}&format=json`);
      setCheck(data);
    } catch (error) {
      onError(error instanceof ApiError ? error.message : "Impossibile verificare l'anteprima.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, kind]);

  useEffect(() => {
    void checkPreview();
  }, [checkPreview]);

  function refresh() {
    setNonce((value) => value + 1);
    void checkPreview();
  }

  /** Il PDF si ottiene dal browser: «Stampa» → «Salva come PDF» (il server non compila LaTeX). */
  function printPreview() {
    const frame = frameRef.current?.contentWindow;
    if (frame) {
      frame.focus();
      frame.print();
    } else {
      window.open(src, "_blank", "noopener");
    }
  }

  const src = `/api/tests/${testId}/preview?kind=${kind}&v=${nonce}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm">
          {KINDS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => {
                setKind(entry.value);
                setNonce((value) => value + 1);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-left text-[12.5px] font-medium transition",
                kind === entry.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="block leading-tight">{entry.label}</span>
              <span
                className={cn(
                  "block text-[10px] leading-tight",
                  kind === entry.value ? "text-primary-foreground/75" : "text-muted-foreground/80",
                )}
              >
                {entry.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={loading ? "neutral" : check?.ok ? "green" : "amber"} dot>
            {loading ? "compilazione…" : check?.ok ? "PDF LaTeX" : "anteprima HTML"}
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={refresh} loading={loading}>
            {loading ? null : <RefreshCw className="h-3.5 w-3.5" />}
            Aggiorna
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.open(src, "_blank", "noopener")}>
            <ExternalLink className="h-3.5 w-3.5" />
            Nuova scheda
          </Button>
          <Button type="button" size="sm" onClick={printPreview}>
            <Printer className="h-3.5 w-3.5" />
            Stampa / Salva come PDF
          </Button>
        </div>
      </div>

      {!loading && check && !check.engineAvailable ? (
        <Notice tone="info" title="Anteprima HTML">
          Il server non compila i PDF LaTeX. Per avere un PDF usa «Stampa / Salva come PDF» (scegli «Salva come PDF» nella
          finestra di stampa). I file .tex restano scaricabili dalla scheda Esporta e si compilano con Overleaf, pdfLaTeX o
          Tectonic.
        </Notice>
      ) : null}

      {!loading && check && check.engineAvailable && !check.ok ? (
        <Notice tone="warning" title="La compilazione LaTeX non è riuscita">
          Qui sotto vedi l&apos;anteprima HTML di riserva. Il sorgente .tex resta disponibile nella scheda Esporta: scaricalo e
          controlla il log.
        </Notice>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Anteprima {KINDS.find((entry) => entry.value === kind)?.label.toLowerCase()} · aggiornata alla versione corrente
        </div>
        <iframe
          ref={frameRef}
          key={`${kind}-${nonce}`}
          src={src}
          title={`Anteprima ${kind}`}
          className="h-[72vh] min-h-[520px] w-full bg-white"
        />
      </div>

      {check?.log ? (
        <details className="rounded-xl border bg-card px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
            <TriangleAlert className="h-3.5 w-3.5" />
            Log della compilazione
          </summary>
          <pre className="log-scroll mt-3 rounded-lg bg-slate-950 p-3 text-slate-100">{check.log.slice(-6000)}</pre>
        </details>
      ) : null}
    </div>
  );
}
