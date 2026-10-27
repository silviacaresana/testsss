"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, FileUp, Sparkles, Wand2 } from "lucide-react";
import { apiFetch, ApiError, ensureCsrf } from "@/lib/client/api";
import { subjectLabel, trackLabel } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Breadcrumbs } from "@/components/ui/page-header";

interface ParsedObjective {
  code: string;
  text: string;
  prerequisites: string[];
  keywords: string[];
}

interface ParsedTopic {
  code: string;
  name: string;
  description: string;
  weightHint: number;
  difficultyMin: number;
  difficultyMax: number;
  isCore: boolean;
  objectives: ParsedObjective[];
}

interface ParsedCurriculum {
  track: "classico" | "scientifico";
  year: number;
  subject: "matematica" | "fisica";
  title: string;
  notes: string;
  topics: ParsedTopic[];
}

interface ImportResult {
  curriculum: ParsedCurriculum;
  mode: "euristico" | "ai";
  warnings: string[];
}

export function CurriculumImport() {
  const router = useRouter();
  const [meta, setMeta] = useState({
    track: "scientifico" as "classico" | "scientifico",
    year: 1,
    subject: "matematica" as "matematica" | "fisica",
    title: "",
    notes: "",
  });
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  function updateMeta<K extends keyof typeof meta>(key: K, value: (typeof meta)[K]) {
    setMeta((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  function defaultTitle() {
    return `${meta.subject === "matematica" ? "Matematica" : "Fisica"} — ${trackLabel(meta.track)} · ${meta.year}ª`;
  }

  async function analyze() {
    setBusy("analyze");
    setError(null);
    setIssues([]);
    try {
      if (!text.trim() && !file) {
        throw new Error("Incolla il testo del programma oppure carica un file PDF, DOCX o TXT.");
      }
      const form = new FormData();
      form.set("track", meta.track);
      form.set("year", String(meta.year));
      form.set("subject", meta.subject);
      form.set("title", meta.title.trim() || defaultTitle());
      form.set("notes", meta.notes);
      form.set("text", text);
      if (file) form.set("file", file);

      const token = await ensureCsrf();
      const response = await fetch("/api/curricula/import", {
        method: "POST",
        headers: { "x-csrf-token": token },
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as
        | { result?: ImportResult; error?: string; issues?: { path?: string; message?: string }[] }
        | null;
      if (!response.ok || !payload?.result) {
        throw new ApiError(
          payload?.error ?? "Importazione non riuscita.",
          response.status,
          payload,
          (payload?.issues ?? []).map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message ?? "")),
        );
      }
      setResult(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Importazione non riuscita.");
      if (caught instanceof ApiError) setIssues(caught.issues);
    } finally {
      setBusy(null);
    }
  }

  async function save(topics: ParsedTopic[]) {
    setBusy("save");
    setError(null);
    setIssues([]);
    try {
      const body = {
        track: meta.track,
        year: meta.year,
        subject: meta.subject,
        title: (meta.title.trim() || defaultTitle()).slice(0, 160),
        notes: meta.notes,
        topics,
      };
      const created = await apiFetch<{ curriculum: { id: string } }>("/api/curricula", { method: "POST", body });
      router.push(`/programmi/${created.curriculum.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Creazione non riuscita.");
      if (caught instanceof ApiError) setIssues(caught.issues);
    } finally {
      setBusy(null);
    }
  }

  const objectiveCount = result?.curriculum.topics.reduce((sum, topic) => sum + topic.objectives.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Programmi", href: "/programmi" }, { label: "Nuovo programma" }]} />

      <div>
        <p className="kicker mb-1.5">Curricolo</p>
        <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">Nuovo programma</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
          Scegli indirizzo, anno e materia, poi importa il testo del curricolo. L&apos;importazione propone argomenti e
          obiettivi: nulla viene pubblicato senza la tua revisione.
        </p>
      </div>

      {error ? (
        <Notice tone="error" title="Operazione non riuscita">
          <p>{error}</p>
          {issues.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      <Card>
        <CardHeader
          title="1. Contesto del programma"
          description="Indirizzo, anno e materia determinano quale versione pubblicata può essere usata dal generatore."
          icon={<BookOpen className="h-4 w-4" />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Indirizzo" required>
            <Select value={meta.track} onChange={(event) => updateMeta("track", event.target.value as typeof meta.track)}>
              <option value="scientifico">Liceo Scientifico</option>
              <option value="classico">Liceo Classico</option>
            </Select>
          </Field>
          <Field label="Anno di corso" required>
            <Select value={meta.year} onChange={(event) => updateMeta("year", Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}ª
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Materia" required>
            <Select
              value={meta.subject}
              onChange={(event) => updateMeta("subject", event.target.value as typeof meta.subject)}
            >
              <option value="matematica">Matematica</option>
              <option value="fisica">Fisica</option>
            </Select>
          </Field>
          <Field label="Titolo" hint="Se vuoto viene proposto un titolo standard.">
            <Input
              value={meta.title}
              onChange={(event) => updateMeta("title", event.target.value)}
              placeholder={defaultTitle()}
            />
          </Field>
          <Field label="Note" className="sm:col-span-2" hint="Indicazioni di dipartimento, riferimenti normativi, criteri comuni.">
            <Textarea
              rows={2}
              value={meta.notes}
              onChange={(event) => updateMeta("notes", event.target.value)}
              placeholder="Es. curricolo approvato in dipartimento il…"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="2. Importa il testo"
          description="Incolla il curricolo oppure carica un PDF, DOCX o TXT (max 12 MB). L'analisi è assistita: controlla sempre il risultato."
          icon={<FileUp className="h-4 w-4" />}
        />
        <CardBody className="space-y-4">
          <Field label="Testo del programma" hint="Sono sufficienti titoli, elenchi e periodi: il parser riconosce argomenti e obiettivi.">
            <Textarea
              rows={10}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setResult(null);
              }}
              placeholder={"1. Funzioni e loro proprietà\n- dominio e codominio\n- grafici e trasformazioni\n\n2. Limiti e continuità\n…"}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-medium shadow-sm transition hover:border-primary/40">
              <FileUp className="h-4 w-4" />
              {file ? file.name : "Carica PDF, DOCX o TXT"}
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                }}
              />
            </label>
            {file ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
                Rimuovi file
              </Button>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" variant="outline" loading={busy === "analyze"} onClick={() => void analyze()}>
                <Wand2 className="h-4 w-4" />
                Analizza testo
              </Button>
              <Button type="button" variant="secondary" loading={busy === "save"} onClick={() => void save([])}>
                Crea bozza vuota
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {result ? (
        <Card>
          <CardHeader
            title="3. Rivedi la proposta"
            description={`${result.curriculum.topics.length} argomenti e ${objectiveCount} obiettivi proposti. Sarà creata una bozza modificabile.`}
            action={<Badge tone={result.mode === "ai" ? "violet" : "amber"}>{result.mode}</Badge>}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <CardBody className="space-y-4">
            {result.warnings.map((warning, index) => (
              <Notice key={index} tone="warning">
                {warning}
              </Notice>
            ))}

            <div className="space-y-2">
              {result.curriculum.topics.map((topic) => (
                <div key={topic.code} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{topic.code}</Badge>
                    <p className="text-[13.5px] font-semibold">{topic.name}</p>
                    <Badge tone="neutral">peso {topic.weightHint}%</Badge>
                    <Badge tone="neutral">
                      difficoltà {topic.difficultyMin}-{topic.difficultyMax}
                    </Badge>
                    {topic.isCore ? <Badge tone="green">nucleo</Badge> : null}
                  </div>
                  {topic.description ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{topic.description}</p>
                  ) : null}
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] leading-relaxed">
                    {topic.objectives.slice(0, 8).map((objective) => (
                      <li key={objective.code}>{objective.text}</li>
                    ))}
                    {topic.objectives.length > 8 ? (
                      <li className="list-none text-muted-foreground">…e altri {topic.objectives.length - 8} obiettivi</li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResult(null)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Modifica il testo
              </Button>
              <Button type="button" loading={busy === "save"} onClick={() => void save(result.curriculum.topics)}>
                Crea bozza e continua
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          L&apos;importazione non pubblica né rende selezionabile il programma: potrai modificare argomenti, obiettivi e pesi
          nella pagina del programma e pubblicare solo quando è pronto.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Contesto: {trackLabel(meta.track)} · {meta.year}ª · {subjectLabel(meta.subject)}
      </p>
    </div>
  );
}
