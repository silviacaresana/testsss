import Link from "next/link";
import { FileText, Filter, Plus, Search, Sparkles, X } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { subjectLabel, trackLabel } from "@/lib/constants";
import { formatDateIT } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export const dynamic = "force-dynamic";

export const metadata = { title: "Verifiche" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TestsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = first(params.q).trim();
  const status = first(params.status);
  const subject = first(params.subject);
  const track = first(params.track);
  const year = Number(first(params.year) || 0);
  const page = Math.max(1, Number(first(params.page) || 1));
  const pageSize = 15;

  const where = {
    ...(user.role === "admin" && first(params.scope) === "all" ? {} : { OR: [{ authorId: user.id }, { isTemplate: true }] }),
    ...(status ? { status } : {}),
    ...(subject ? { subject } : {}),
    ...(track ? { track } : {}),
    ...(year >= 1 && year <= 5 ? { year } : {}),
    ...(q ? { AND: [{ OR: [{ title: { contains: q } }, { classLabel: { contains: q } }] }] } : {}),
  };

  const [total, tests] = await Promise.all([
    prisma.test.count({ where }),
    prisma.test.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        items: { select: { points: true, estimatedMin: true } },
        _count: { select: { items: true, versions: true } },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(q || status || subject || track || (year >= 1 && year <= 5));

  function pageHref(target: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (status) search.set("status", status);
    if (subject) search.set("subject", subject);
    if (track) search.set("track", track);
    if (year) search.set("year", String(year));
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return `/verifiche${query ? `?${query}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Archivio personale"
        title="Verifiche"
        description="Bozze, verifiche approvate e modelli riutilizzabili. Ogni verifica conserva il programma di riferimento e lo storico delle versioni."
        actions={
          <ButtonLink href="/verifiche/nuova">
            <Plus className="h-4 w-4" />
            Nuova verifica
          </ButtonLink>
        }
      />

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr_0.6fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input name="q" defaultValue={q} placeholder="Cerca per titolo o classe" className="pl-9" />
          </div>
          <Select name="subject" defaultValue={subject} aria-label="Materia">
            <option value="">Tutte le materie</option>
            <option value="matematica">Matematica</option>
            <option value="fisica">Fisica</option>
          </Select>
          <Select name="track" defaultValue={track} aria-label="Indirizzo">
            <option value="">Tutti gli indirizzi</option>
            <option value="classico">Classico</option>
            <option value="scientifico">Scientifico</option>
          </Select>
          <Select name="year" defaultValue={year ? String(year) : ""} aria-label="Anno">
            <option value="">Tutti gli anni</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}ª
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Stato">
            <option value="">Ogni stato</option>
            <option value="bozza">Bozza</option>
            <option value="approvata">Approvata</option>
          </Select>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" className="flex-1">
              <Filter className="h-4 w-4" />
              Filtra
            </Button>
            {hasFilters ? (
              <Link
                href="/verifiche"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:text-foreground"
                aria-label="Azzera filtri"
              >
                <X className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {tests.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title={hasFilters ? "Nessuna verifica corrisponde ai filtri" : "Non hai ancora verifiche"}
              description={
                hasFilters
                  ? "Prova a cambiare materia, indirizzo o stato: l'archivio mostra solo le verifiche che puoi vedere."
                  : "Crea la prima verifica: scegli il programma, imposta punti e durata, poi rivedi la proposta del generatore."
              }
              action={
                hasFilters ? (
                  <ButtonLink href="/verifiche" variant="outline" size="sm">
                    Azzera filtri
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/verifiche/nuova" size="sm">
                    <Sparkles className="h-3.5 w-3.5" />
                    Inizia adesso
                  </ButtonLink>
                )
              }
            />
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="pl-5">Verifica</th>
                  <th>Contesto</th>
                  <th>Punteggio</th>
                  <th>Tempo</th>
                  <th>Quesiti</th>
                  <th>Stato</th>
                  <th className="pr-5">Modificata</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => {
                  const points = Math.round(test.items.reduce((sum, item) => sum + item.points, 0) * 100) / 100;
                  const minutes = test.items.reduce((sum, item) => sum + item.estimatedMin, 0);
                  const balanced = Math.abs(points - test.totalPoints) < 0.001;
                  const timeOk = Math.abs(minutes - test.durationMin) <= test.durationMin * 0.1;
                  return (
                    <tr key={test.id}>
                      <td className="pl-5">
                        <Link href={`/verifiche/${test.id}`} className="font-medium hover:text-primary">
                          {test.title}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {test.isTemplate ? "Modello · " : ""}v{test.versionLabel} · {test._count.versions} versioni
                        </p>
                      </td>
                      <td className="text-[12.5px]">
                        <p className="font-medium">{subjectLabel(test.subject)}</p>
                        <p className="text-muted-foreground">
                          {trackLabel(test.track)} · {test.year}ª {test.classLabel ? `· ${test.classLabel}` : ""}
                        </p>
                      </td>
                      <td>
                        <Badge tone={balanced ? "green" : "red"}>
                          {points} / {test.totalPoints}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={timeOk ? "green" : "amber"}>{minutes} min</Badge>
                        <p className="mt-1 text-[10.5px] text-muted-foreground">previsti {test.durationMin}</p>
                      </td>
                      <td className="text-[13px]">{test._count.items}</td>
                      <td>
                        <StatusBadge status={test.status} />
                      </td>
                      <td className="whitespace-nowrap pr-5 text-[12px] text-muted-foreground">
                        {formatDateIT(test.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[12px] text-muted-foreground">
            <span>
              {total} {total === 1 ? "verifica" : "verifiche"} · pagina {page} di {pages}
            </span>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={pageHref(page - 1)} variant="outline" size="sm">
                    Precedente
                  </ButtonLink>
                ) : null}
                {page < pages ? (
                  <ButtonLink href={pageHref(page + 1)} variant="outline" size="sm">
                    Successiva
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
