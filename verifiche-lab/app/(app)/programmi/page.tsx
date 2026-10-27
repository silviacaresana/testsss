import Link from "next/link";
import { BookOpen, Filter, Plus, Search, X } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listCurricula } from "@/lib/curriculum/service";
import { subjectLabel, trackLabel } from "@/lib/constants";
import { formatDateIT } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, EmptyState } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export const dynamic = "force-dynamic";

export const metadata = { title: "Programmi" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CurriculaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const track = first(params.track);
  const subject = first(params.subject);
  const status = first(params.status);
  const year = Number(first(params.year) || 0);
  const q = first(params.q).trim().toLowerCase();

  const all = await listCurricula(user, {
    track,
    subject,
    status,
    year: year >= 1 && year <= 5 ? year : undefined,
  });
  const curricula = q
    ? all.filter((entry) =>
        [entry.title, entry.authorName, ...entry.topics.map((topic) => topic.name)].join(" ").toLowerCase().includes(q),
      )
    : all;
  const hasFilters = Boolean(q || track || subject || status || (year >= 1 && year <= 5));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Dipartimento"
        title="Programmi"
        description="Curricoli per indirizzo, anno e materia. Un programma pubblicato è la base condivisa da cui nascono le verifiche; le modifiche passano da nuove versioni."
        actions={
          <ButtonLink href="/programmi/nuovo">
            <Plus className="h-4 w-4" />
            Nuovo programma
          </ButtonLink>
        }
      />

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_0.9fr_0.9fr_0.8fr_0.8fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input name="q" defaultValue={q} placeholder="Titolo, autore o argomento" className="pl-9" />
          </div>
          <Select name="track" defaultValue={track} aria-label="Indirizzo">
            <option value="">Tutti gli indirizzi</option>
            <option value="classico">Classico</option>
            <option value="scientifico">Scientifico</option>
          </Select>
          <Select name="subject" defaultValue={subject} aria-label="Materia">
            <option value="">Tutte le materie</option>
            <option value="matematica">Matematica</option>
            <option value="fisica">Fisica</option>
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
            <option value="pubblicato">Pubblicato</option>
            <option value="archiviato">Archiviato</option>
          </Select>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              <Filter className="h-4 w-4" />
              Filtra
            </Button>
            {hasFilters ? (
              <Link
                href="/programmi"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:text-foreground"
                aria-label="Azzera filtri"
              >
                <X className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {curricula.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title={hasFilters ? "Nessun programma corrisponde ai filtri" : "Nessun programma disponibile"}
              description={
                hasFilters
                  ? "Modifica indirizzo, anno o stato: i programmi archiviati restano consultabili."
                  : "Crea il primo programma: puoi incollare il testo del curricolo o importarlo da PDF, DOCX o TXT, poi rivedere argomenti e obiettivi."
              }
              action={
                hasFilters ? (
                  <ButtonLink href="/programmi" variant="outline" size="sm">
                    Azzera filtri
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/programmi/nuovo" size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Crea programma
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
                  <th className="pl-5">Programma</th>
                  <th>Contesto</th>
                  <th>Argomenti</th>
                  <th>Obiettivi</th>
                  <th>Verifiche</th>
                  <th>Stato</th>
                  <th className="pr-5">Aggiornato</th>
                </tr>
              </thead>
              <tbody>
                {curricula.map((entry) => {
                  const objectives = entry.topics.reduce((sum, topic) => sum + topic.objectives.length, 0);
                  return (
                    <tr key={entry.id}>
                      <td className="max-w-[300px] pl-5">
                        <Link href={`/programmi/${entry.id}`} className="font-medium hover:text-primary">
                          {entry.title}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          v{entry.version} · {entry.authorName}
                          {entry.canEdit ? " · modificabile" : " · sola lettura"}
                        </p>
                      </td>
                      <td className="text-[12.5px]">
                        <p className="font-medium">{subjectLabel(entry.subject)}</p>
                        <p className="text-muted-foreground">
                          {trackLabel(entry.track)} · {entry.year}ª
                        </p>
                      </td>
                      <td className="text-[13px]">{entry.topics.length}</td>
                      <td className="text-[13px]">{objectives}</td>
                      <td className="text-[13px]">{entry.testsCount}</td>
                      <td>
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="whitespace-nowrap pr-5 text-[12px] text-muted-foreground">
                        {formatDateIT(entry.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t px-5 py-3 text-[12px] text-muted-foreground">
            {curricula.length} {curricula.length === 1 ? "programma" : "programmi"}
            {hasFilters ? " con i filtri attivi" : ""}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">pubblicato</Badge>
        <span className="text-[11.5px] text-muted-foreground">
          è la versione usata dal generatore per indirizzo, anno e materia.
        </span>
        <Badge tone="amber">bozza</Badge>
        <span className="text-[11.5px] text-muted-foreground">è visibile al dipartimento ma non selezionabile nel wizard.</span>
      </div>
    </div>
  );
}
