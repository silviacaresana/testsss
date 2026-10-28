"use client";

import { useState } from "react";
import { Braces, FileCode2, FileDown, FileText, Package, TriangleAlert } from "lucide-react";
import { ApiError, downloadRequest, triggerDownload } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

type Kind = "verifica" | "soluzioni" | "griglia";
type Format = "tex" | "pdf" | "zip" | "json";

interface ExportFailure {
  message: string;
  log?: string;
  kind: Kind;
}

const DOCUMENTS: { kind: Kind; title: string; description: string; icon: React.ReactNode }[] = [
  {
    kind: "verifica",
    title: "Verifica",
    description: "Foglio da stampare per gli studenti: intestazione, sezioni, punteggi e spazio risposta.",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    kind: "soluzioni",
    title: "Soluzioni",
    description: "Svolgimenti passo per passo e criteri di punteggio per ogni quesito.",
    icon: <FileDown className="h-4 w-4" />,
  },
  {
    kind: "griglia",
    title: "Griglia di valutazione",
    description: "Indicatori, livelli, associazione quesiti e tabella di conversione in decimi.",
    icon: <FileCode2 className="h-4 w-4" />,
  },
];

export function ExportPanel({
  testId,
  onError,
  onSuccess,
}: {
  testId: string;
  onError: (message: string, issues?: string[]) => void;
  onSuccess: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);

  async function download(format: Format, kind: Kind) {
    const key = `${format}-${kind}`;
    setBusy(key);
    setFailure(null);
    try {
      const extension = format === "pdf" ? "pdf" : format === "tex" ? "tex" : format === "zip" ? "zip" : "json";
      const result = await downloadRequest(
        `/api/tests/${testId}/export`,
        { format, kind },
        `verifica-${kind}.${extension}`,
      );
      triggerDownload(result);
      onSuccess(`Download avviato: ${result.filename}`);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      const payload = apiError?.payload as { canDownloadTex?: boolean; log?: string } | null;
      if (payload?.canDownloadTex) {
        setFailure({
          message: apiError?.message ?? "La compilazione LaTeX non è riuscita.",
          log: apiError?.log ?? payload.log,
          kind,
        });
      } else {
        onError(apiError?.message ?? "Esportazione non riuscita.", apiError?.issues);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Notice tone="info" title="Il sorgente .tex è un prodotto, non un dettaglio">
        Ogni documento è un file LaTeX autonomo, compilabile con Overleaf, Tectonic o pdflatex: non serve alcun file di
        supporto. Il server non produce PDF; per un PDF immediato usa «Stampa / Salva come PDF» nella scheda Anteprima.
      </Notice>

      {failure ? (
        <Notice
          tone="error"
          title="Compilazione PDF non riuscita"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={busy === `tex-${failure.kind}`}
              onClick={() => void download("tex", failure.kind)}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Scarica .tex
            </Button>
          }
        >
          <p>{failure.message}</p>
          {failure.log ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] font-medium">Log di compilazione</summary>
              <pre className="log-scroll mt-2 max-h-56 rounded-lg bg-slate-950 p-3 text-[10.5px] text-slate-100">
                {failure.log.slice(-6000)}
              </pre>
            </details>
          ) : null}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {DOCUMENTS.map((document) => (
          <Card key={document.kind} className="flex flex-col">
            <CardHeader title={document.title} description={document.description} icon={document.icon} />
            <CardBody className="mt-auto space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  loading={busy === `tex-${document.kind}`}
                  onClick={() => void download("tex", document.kind)}
                >
                  {busy === `tex-${document.kind}` ? null : <FileCode2 className="h-3.5 w-3.5" />}
                  Sorgente .tex
                </Button>
              </div>
              <p className="text-[10.5px] text-muted-foreground">Pagine numerate «Pag. X di Y» · font e formule inclusi</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Pacchetto completo (.zip)"
            description="I tre documenti in .tex, più i dati strutturati e un README con le istruzioni di compilazione."
            icon={<Package className="h-4 w-4" />}
            action={<Badge tone="green">consigliato</Badge>}
          />
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-[12px] text-muted-foreground">
              <p>Contenuto: verifica, soluzioni, griglia · JSON · README.txt</p>
              <p>Nel pacchetto trovi anche un breve file di log che spiega perché non ci sono i PDF.</p>
            </div>
            <Button
              type="button"
              loading={busy === "zip-verifica"}
              onClick={() => void download("zip", "verifica")}
            >
              {busy === "zip-verifica" ? null : <Package className="h-4 w-4" />}
              Scarica pacchetto
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Dati strutturati"
            description="JSON completo della verifica per backup, versionamento o rielaborazione."
            icon={<Braces className="h-4 w-4" />}
          />
          <CardBody>
            <Button
              type="button"
              variant="outline"
              loading={busy === "json-verifica"}
              onClick={() => void download("json", "verifica")}
            >
              {busy === "json-verifica" ? null : <Braces className="h-4 w-4" />}
              Scarica JSON
            </Button>
          </CardBody>
        </Card>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-900">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Prima di stampare, controlla l&apos;anteprima: formule, figure e a capo possono richiedere una piccola
        correzione manuale del sorgente .tex. Il file resta modificabile in qualsiasi editor di testo.
      </p>
    </div>
  );
}
