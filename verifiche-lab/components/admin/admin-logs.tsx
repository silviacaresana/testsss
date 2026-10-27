"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, History, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { cn, formatDateTimeIT } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

interface RunRow {
  id: string;
  userName: string;
  testId: string | null;
  testTitle: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costEstimate: number;
  durationMs: number;
  status: string;
  errors: string[];
  promptExcerpt: string;
  createdAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  meta: Record<string, unknown>;
  userName: string;
  userEmail: string;
  createdAt: string;
}

interface RunsResponse {
  type: string;
  total: number;
  page: number;
  pages: number;
  runs: RunRow[];
}

interface AuditResponse {
  type: string;
  total: number;
  page: number;
  pages: number;
  audit: AuditRow[];
}

export function AdminLogs() {
  const [tab, setTab] = useState<"generazioni" | "audit">("generazioni");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: tab, page: String(page) });
      if (search) params.set("q", search);
      if (tab === "generazioni") {
        const data = await apiFetch<RunsResponse>(`/api/admin/logs?${params.toString()}`);
        setRuns(data.runs);
        setPages(data.pages);
        setTotal(data.total);
      } else {
        const data = await apiFetch<AuditResponse>(`/api/admin/logs?${params.toString()}`);
        setAudit(data.audit);
        setPages(data.pages);
        setTotal(data.total);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Caricamento non riuscito.");
    } finally {
      setLoading(false);
    }
  }, [tab, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeTab(next: "generazioni" | "audit") {
    setTab(next);
    setPage(1);
    setExpanded(null);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  const totalCost = runs.reduce((sum, run) => sum + run.costEstimate, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => changeTab("generazioni")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition",
              tab === "generazioni" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <History className="h-3.5 w-3.5" />
            Generazioni
          </button>
          <button
            type="button"
            onClick={() => changeTab("audit")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition",
              tab === "audit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Audit
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "generazioni" ? "Docente, modello o verifica" : "Azione, entità o docente"}
                className="h-9 w-64 pl-9 text-[12.5px]"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Cerca
            </Button>
          </form>
          <Button type="button" variant="ghost" size="sm" loading={loading} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Aggiorna
          </Button>
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {tab === "generazioni" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2.5 text-[11.5px] text-muted-foreground">
            <span>
              {total} generazioni · pagina {page} di {pages}
            </span>
            <span>
              Costo visibile in pagina:{" "}
              {totalCost.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="pl-5">Quando</th>
                  <th>Docente</th>
                  <th>Provider / modello</th>
                  <th>Token</th>
                  <th>Costo</th>
                  <th>Durata</th>
                  <th>Esito</th>
                  <th className="pr-5">Verifica</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-6 text-center text-[12.5px] text-muted-foreground">
                      Nessuna generazione registrata.
                    </td>
                  </tr>
                ) : null}
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap pl-5 text-[11.5px] text-muted-foreground">{formatDateTimeIT(run.createdAt)}</td>
                    <td className="text-[12.5px]">{run.userName}</td>
                    <td className="text-[12px]">
                      <p className="font-medium">{run.provider}</p>
                      <p className="text-muted-foreground">{run.model}</p>
                    </td>
                    <td className="text-[11.5px] text-muted-foreground">
                      {run.promptTokens} / {run.completionTokens}
                    </td>
                    <td className="text-[12px]">{run.costEstimate.toFixed(4)} €</td>
                    <td className="text-[12px]">{Math.round(run.durationMs / 100) / 10} s</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={run.status} />
                        {run.errors.length > 0 ? (
                          <button
                            type="button"
                            className="rounded-md p-1 text-amber-700 hover:bg-amber-50"
                            onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                            aria-label="Mostra errori"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      {expanded === run.id && run.errors.length > 0 ? (
                        <ul className="mt-1 max-w-xs list-disc space-y-0.5 pl-4 text-[10.5px] text-red-700">
                          {run.errors.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                      {expanded === run.id && run.promptExcerpt ? (
                        <p className="mt-1 max-w-xs text-[10.5px] text-muted-foreground">Prompt: {run.promptExcerpt}</p>
                      ) : null}
                    </td>
                    <td className="pr-5 text-[11.5px]">
                      {run.testId ? (
                        <Link href={`/verifiche/${run.testId}`} className="text-primary hover:underline">
                          {run.testTitle ?? "apri"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b bg-muted/20 px-4 py-2.5 text-[11.5px] text-muted-foreground">
            {total} azioni · pagina {page} di {pages}
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="pl-5">Quando</th>
                  <th>Utente</th>
                  <th>Azione</th>
                  <th>Entità</th>
                  <th className="pr-5">Dettagli</th>
                </tr>
              </thead>
              <tbody>
                {audit.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-[12.5px] text-muted-foreground">
                      Nessuna azione registrata.
                    </td>
                  </tr>
                ) : null}
                {audit.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap pl-5 text-[11.5px] text-muted-foreground">{formatDateTimeIT(row.createdAt)}</td>
                    <td className="text-[12.5px]">
                      <p>{row.userName}</p>
                      {row.userEmail ? <p className="text-[10.5px] text-muted-foreground">{row.userEmail}</p> : null}
                    </td>
                    <td>
                      <Badge tone="neutral">{row.action}</Badge>
                    </td>
                    <td className="text-[12px]">
                      {row.entity}
                      {row.entityId ? <span className="block text-[10.5px] text-muted-foreground">{row.entityId}</span> : null}
                    </td>
                    <td className="max-w-[360px] pr-5">
                      {Object.keys(row.meta).length > 0 ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[10.5px] leading-snug text-muted-foreground">
                          {JSON.stringify(row.meta, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
            Precedente
          </Button>
          <span className="text-[12px] text-muted-foreground">
            {page} / {pages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
            Successiva
          </Button>
        </div>
      ) : null}
    </div>
  );
}
