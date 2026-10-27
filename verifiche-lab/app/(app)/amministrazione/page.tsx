import Link from "next/link";
import {
  BookOpen,
  FileText,
  Gauge,
  GraduationCap,
  Library,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { subjectLabel } from "@/lib/constants";
import { formatDateIT, formatDateTimeIT } from "@/lib/utils";
import { PageHeader, Stat } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Amministrazione" };

export default async function AdminPage() {
  await requireAdmin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    users,
    teachers,
    tests,
    approvedTests,
    curricula,
    publishedCurricula,
    bankEntries,
    exportsCount,
    runsThisMonth,
    costThisMonth,
    recentTests,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "teacher" } }),
    prisma.test.count(),
    prisma.test.count({ where: { status: "approvata" } }),
    prisma.curriculum.count(),
    prisma.curriculum.count({ where: { status: "pubblicato" } }),
    prisma.itemBankEntry.count(),
    prisma.export.count(),
    prisma.generationRun.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.generationRun.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costEstimate: true } }),
    prisma.test.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        subject: true,
        year: true,
        status: true,
        updatedAt: true,
        author: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const cost = Math.round((costThisMonth._sum.costEstimate ?? 0) * 10000) / 10000;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Dipartimento"
        title="Amministrazione"
        description="Stato del laboratorio: docenti, programmi, verifiche, banca quesiti e consumi del generatore. Le azioni riservate sono tracciate nel log."
        actions={
          <>
            <ButtonLink href="/amministrazione/utenti" variant="outline">
              <Users className="h-4 w-4" />
              Docenti
            </ButtonLink>
            <ButtonLink href="/amministrazione/impostazioni">
              <Gauge className="h-4 w-4" />
              Impostazioni
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Docenti" value={users} note={`${teachers} docenti · ${users - teachers} amministratori`} icon={<Users className="h-4 w-4" />} />
        <Stat
          label="Verifiche"
          value={tests}
          note={`${approvedTests} approvate · ${tests - approvedTests} in bozza`}
          icon={<FileText className="h-4 w-4" />}
          tone="primary"
        />
        <Stat
          label="Programmi"
          value={curricula}
          note={`${publishedCurricula} pubblicati`}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <Stat label="Banca quesiti" value={bankEntries} note={`${exportsCount} esportazioni`} icon={<Library className="h-4 w-4" />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Generazioni questo mese"
          value={runsThisMonth}
          note="chiamate al generatore, incluse le varianti"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <Stat
          label="Costo stimato questo mese"
          value={`${cost.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`}
          note="in modalità offline il costo è zero"
          icon={<GraduationCap className="h-4 w-4" />}
          tone="accent"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Verifiche recenti"
            description="Ultime modifiche nel dipartimento."
            action={
              <ButtonLink href="/verifiche" variant="outline" size="sm">
                Tutte
              </ButtonLink>
            }
          />
          <div className="divide-y">
            {recentTests.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">Nessuna verifica ancora creata.</p>
            ) : (
              recentTests.map((test) => (
                <div key={test.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/verifiche/${test.id}`} className="block truncate text-[13px] font-medium hover:text-primary">
                      {test.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {test.author.name} · {subjectLabel(test.subject)} · {test.year}ª · {formatDateTimeIT(test.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={test.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Attività recente"
            description="Ultime azioni tracciate."
            icon={<ShieldCheck className="h-4 w-4" />}
            action={
              <ButtonLink href="/amministrazione/log" variant="outline" size="sm">
                Log
              </ButtonLink>
            }
          />
          <div className="divide-y">
            {recentAudit.map((entry) => (
              <div key={entry.id} className="px-5 py-2.5">
                <p className="text-[12.5px]">
                  <span className="font-medium">{entry.user?.name ?? "Sistema"}</span> · {entry.action} {entry.entity.toLowerCase()}
                </p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">{formatDateTimeIT(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Promemoria operativi"
          description="Scelte di configurazione che incidono su tutto il dipartimento."
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <Badge tone="green">programmi</Badge>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Per ogni combinazione indirizzo/anno/materia esiste al massimo un programma pubblicato. Il wizard usa quello.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <Badge tone="blue">generatore</Badge>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              In modalità offline nessuna chiave è necessaria. Prima di passare a un provider AI imposta un budget mensile.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <Badge tone="amber">privacy</Badge>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Non inserire nomi o dati degli studenti: le etichette di classe servono solo a distinguere le sezioni.
            </p>
          </div>
        </CardBody>
      </Card>

      <p className="text-[11px] text-muted-foreground">Dati aggiornati al {formatDateIT(now)}.</p>
    </div>
  );
}
