import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  PencilLine,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDateIT, formatDateTimeIT } from "@/lib/utils";
import { subjectLabel, trackLabel } from "@/lib/constants";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Panoramica" };

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();

  const [tests, totalTests, approvedCount, draftCount, lastTest] = await Promise.all([
    prisma.test.findMany({
      where: { authorId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { _count: { select: { items: true } }, items: { select: { points: true, estimatedMin: true } } },
    }),
    prisma.test.count({ where: { authorId: user.id } }),
    prisma.test.count({ where: { authorId: user.id, status: "approvata" } }),
    prisma.test.count({ where: { authorId: user.id, status: "bozza" } }),
    prisma.test.findFirst({
      where: { authorId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    }),
  ]);

  const greeting =
    now.getHours() < 13 ? "Buongiorno" : now.getHours() < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <div className="space-y-7">
      <PageHeader
        kicker={new Intl.DateTimeFormat("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(now)}
        title={`${greeting}.`}
        description="Riprendi una verifica oppure prepara la prossima. Le verifiche sono salvate nel database e puoi scaricarle in qualsiasi momento."
        actions={
          <>
            <ButtonLink href="/verifiche" variant="outline" size="md">
              <FileText className="h-4 w-4" />
              Le mie verifiche
            </ButtonLink>
            <ButtonLink href="/verifiche/nuova" size="md">
              <Plus className="h-4 w-4" />
              Nuova verifica
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Verifiche"
          value={String(totalTests)}
          note={`${draftCount} in bozza · ${approvedCount} approvate`}
          icon={<FileText className="h-4 w-4" />}
          tone="primary"
        />
        <Stat
          label="In bozza"
          value={String(draftCount)}
          note="Da rivedere e approvare"
          icon={<PencilLine className="h-4 w-4" />}
        />
        <Stat
          label="Ultima modifica"
          value={lastTest ? formatDateIT(lastTest.updatedAt) : "—"}
          note={lastTest ? lastTest.title : "Nessuna verifica ancora"}
          icon={<ClipboardList className="h-4 w-4" />}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Verifiche recenti"
            description="Le ultime bozze e verifiche approvate che hai preparato."
            action={
              <Link href="/verifiche" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                Tutte <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {tests.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title="La prima verifica parte dal programma"
                description="Scegli indirizzo, anno e materia, seleziona gli argomenti e lascia che il generatore proponga una bozza completa. Potrai modificare ogni singolo quesito."
                action={
                  <ButtonLink href="/verifiche/nuova" size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Crea una verifica
                  </ButtonLink>
                }
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto px-2 pb-2">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Verifica</th>
                    <th>Classe</th>
                    <th>Punti</th>
                    <th>Stato</th>
                    <th>Modificata</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((test) => {
                    const points = test.items.reduce((sum, item) => sum + item.points, 0);
                    return (
                      <tr key={test.id}>
                        <td>
                          <Link href={`/verifiche/${test.id}`} className="font-medium hover:text-primary">
                            {test.title}
                          </Link>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {subjectLabel(test.subject)} · {trackLabel(test.track)} · {test.year}ª
                          </p>
                        </td>
                        <td className="text-[13px]">{test.classLabel || "—"}</td>
                        <td className="text-[13px]">
                          {Math.round(points * 100) / 100}
                          <span className="text-muted-foreground"> / {test.totalPoints}</span>
                        </td>
                        <td>
                          <StatusBadge status={test.status} />
                        </td>
                        <td className="whitespace-nowrap text-[12px] text-muted-foreground">
                          {formatDateTimeIT(test.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Il percorso in tre passi" icon={<CheckCircle2 className="h-4 w-4" />} />
            <CardBody className="space-y-4">
              {[
                {
                  title: "Scegli il contesto",
                  text: "Indirizzo, anno e materia: il contesto didattico guida ogni scelta.",
                  href: "/verifiche/nuova",
                },
                {
                  title: "Componi la verifica",
                  text: "Sette passaggi, con controllo di punti e tempi prima di generare.",
                  href: "/verifiche/nuova",
                },
                {
                  title: "Rivedi ed esporta",
                  text: "Modifica i quesiti, approva, scarica il LaTeX con soluzioni e griglia.",
                  href: "/verifiche",
                },
              ].map((step, index) => (
                <Link key={step.title} href={step.href} className="group flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/[0.06] text-[11px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold group-hover:text-primary">{step.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{step.text}</span>
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Promemoria di qualità" icon={<TriangleAlert className="h-4 w-4" />} />
            <CardBody className="space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <p className="flex gap-2">
                <Badge tone="green">100 pt</Badge>
                Il totale deve coincidere: il motore normalizza e segnala gli scostamenti.
              </p>
              <p className="flex gap-2">
                <Badge tone="amber">54–66 min</Badge>
                Per una prova da 60 minuti, il tempo stimato deve restare nella tolleranza del 10%.
              </p>
              <p className="flex gap-2">
                <Badge tone="blue">Classico</Badge>
                Meno calcolo simbolico, più lettura e argomentazione: il profilo cambia davvero.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
