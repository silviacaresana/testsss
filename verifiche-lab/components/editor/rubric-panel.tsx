"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ListChecks, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import type { SerializedTest } from "@/lib/tests/repository";
import { apiFetch, ApiError } from "@/lib/client/api";
import { computeIndicatorScores, gradeTable } from "@/lib/grading";
import type { GradeMapping } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatPoints, type GradeScaleOption } from "@/components/editor/types";

interface RubricLevel {
  level: number;
  label: string;
  descriptor: string;
}

const DEFAULT_BANDS = [
  { minPercent: 0, grade: 2 },
  { minPercent: 30, grade: 4 },
  { minPercent: 50, grade: 5 },
  { minPercent: 60, grade: 6 },
  { minPercent: 70, grade: 7 },
  { minPercent: 80, grade: 8 },
  { minPercent: 90, grade: 9 },
  { minPercent: 95, grade: 10 },
];

interface StoredMapping {
  mode?: string;
  bands?: { minPercent: number; grade: number }[];
}

function storedMapping(test: SerializedTest): StoredMapping {
  const value = test.gradeScale?.mapping;
  if (value && typeof value === "object") return value as StoredMapping;
  return {};
}

export function RubricPanel({
  test,
  gradeScales,
  canEdit,
  onTestUpdate,
  onError,
  onSuccess,
}: {
  test: SerializedTest;
  gradeScales: GradeScaleOption[];
  canEdit: boolean;
  onTestUpdate: (test: SerializedTest) => void;
  onError: (message: string, issues?: string[]) => void;
  onSuccess: (message: string) => void;
}) {
  const [indicators, setIndicators] = useState<string[]>(() => [...test.rubric.indicators]);
  const [levels, setLevels] = useState<RubricLevel[]>(() => test.rubric.levels.map((level) => ({ ...level })));
  const [mapping, setMapping] = useState<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const item of test.items) {
      const current = test.rubric.itemMapping[item.id];
      next[item.id] = current && current.length > 0 ? [...current] : [test.rubric.indicators[0] ?? "Conoscenze"];
    }
    return next;
  });
  const [gradeScaleId, setGradeScaleId] = useState(test.gradeScale?.id ?? test.gradeScaleId ?? "");
  const activeScale = gradeScales.find((scale) => scale.id === gradeScaleId) ?? test.gradeScale ?? null;
  const [threshold, setThreshold] = useState(
    test.gradeScale?.sufficiencyThreshold ?? gradeScales.find((scale) => scale.isDefault)?.sufficiencyThreshold ?? 60,
  );
  const [mode, setMode] = useState<string>(() => storedMapping(test).mode ?? "lineare");
  const [bands, setBands] = useState<{ minPercent: number; grade: number }[]>(() => {
    const stored = storedMapping(test).bands;
    return stored && stored.length > 0 ? stored.map((band) => ({ ...band })) : DEFAULT_BANDS.map((band) => ({ ...band }));
  });
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const gradeMapping: GradeMapping = useMemo(
    () => ({ mode: mode as GradeMapping["mode"], ...(mode === "scaglioni" ? { bands } : {}) }),
    [mode, bands],
  );

  const totals = useMemo(
    () => computeIndicatorScores(test.items, mapping, indicators),
    [test.items, mapping, indicators],
  );

  const gradeRows = useMemo(
    () => gradeTable(test.totalPoints, threshold, gradeMapping),
    [test.totalPoints, threshold, gradeMapping],
  );

  function reset() {
    setIndicators([...test.rubric.indicators]);
    setLevels(test.rubric.levels.map((level) => ({ ...level })));
    const next: Record<string, string[]> = {};
    for (const item of test.items) {
      const current = test.rubric.itemMapping[item.id];
      next[item.id] = current && current.length > 0 ? [...current] : [test.rubric.indicators[0] ?? "Conoscenze"];
    }
    setMapping(next);
    setGradeScaleId(test.gradeScale?.id ?? test.gradeScaleId ?? "");
    setThreshold(test.gradeScale?.sufficiencyThreshold ?? threshold);
    setMode(storedMapping(test).mode ?? "lineare");
    const stored = storedMapping(test).bands;
    setBands(stored && stored.length > 0 ? stored.map((band) => ({ ...band })) : DEFAULT_BANDS.map((band) => ({ ...band })));
    setLocalError(null);
  }

  function renameIndicator(index: number, value: string) {
    const oldName = indicators[index];
    const next = [...indicators];
    next[index] = value;
    setIndicators(next);
    if (oldName !== value) {
      setMapping((prev) => {
        const updated: Record<string, string[]> = {};
        for (const [itemId, names] of Object.entries(prev)) {
          updated[itemId] = names.map((name) => (name === oldName ? value : name));
        }
        return updated;
      });
    }
  }

  function removeIndicator(name: string) {
    if (indicators.length <= 1) {
      setLocalError("Serve almeno un indicatore.");
      return;
    }
    setIndicators((prev) => prev.filter((indicator) => indicator !== name));
    setMapping((prev) => {
      const updated: Record<string, string[]> = {};
      for (const [itemId, names] of Object.entries(prev)) {
        const filtered = names.filter((indicator) => indicator !== name);
        updated[itemId] = filtered.length > 0 ? filtered : [indicators.find((indicator) => indicator !== name) ?? ""];
      }
      return updated;
    });
  }

  function toggleMapping(itemId: string, indicator: string) {
    setMapping((prev) => {
      const current = prev[itemId] ?? [];
      const next = current.includes(indicator)
        ? current.filter((name) => name !== indicator)
        : [...current, indicator];
      return { ...prev, [itemId]: next };
    });
  }

  async function save() {
    const cleanIndicators = [...new Set(indicators.map((indicator) => indicator.trim()).filter(Boolean))];
    if (cleanIndicators.length === 0) {
      setLocalError("Inserisci almeno un indicatore.");
      return;
    }
    if (levels.length < 2) {
      setLocalError("Servono almeno due livelli.");
      return;
    }
    if (levels.some((level) => !level.label.trim() || level.descriptor.trim().length < 3)) {
      setLocalError("Ogni livello deve avere etichetta e descrittore.");
      return;
    }
    if (mode === "scaglioni" && bands.length === 0) {
      setLocalError("Aggiungi almeno una fascia per la conversione a scaglioni.");
      return;
    }
    setWorking(true);
    setLocalError(null);
    try {
      const data = await apiFetch<{ test: SerializedTest }>(`/api/tests/${test.id}/rubric`, {
        method: "PATCH",
        body: {
          indicators: cleanIndicators,
          levels: levels.map((level) => ({
            level: level.level,
            label: level.label.trim(),
            descriptor: level.descriptor.trim(),
          })),
          itemMapping: mapping,
          gradeScaleId: gradeScaleId || null,
          sufficiencyThreshold: threshold,
        },
      });
      onTestUpdate(data.test);
      onSuccess("Griglia e criteri di conversione salvati.");
    } catch (error) {
      onError(
        error instanceof ApiError ? error.message : "Impossibile salvare la griglia.",
        error instanceof ApiError ? error.issues : undefined,
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-5">
      {!canEdit ? (
        <Notice tone="info" title="Sola lettura">
          Non sei l&apos;autore di questa verifica: puoi consultare la griglia ma non modificarla.
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Indicatori di valutazione"
            description="Fino a otto indicatori. Ogni quesito può contribuire a più indicatori: i punti vengono distribuiti in parti uguali."
            icon={<ListChecks className="h-4 w-4" />}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit || indicators.length >= 8}
                onClick={() => setIndicators((prev) => [...prev, `Indicatore ${prev.length + 1}`])}
              >
                <Plus className="h-3.5 w-3.5" />
                Indicatore
              </Button>
            }
          />
          <CardBody className="space-y-2.5">
            {indicators.map((indicator, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={indicator}
                  disabled={!canEdit}
                  onChange={(event) => renameIndicator(index, event.target.value)}
                  aria-label={`Indicatore ${index + 1}`}
                />
                <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                  {formatPoints(totals[indicator] ?? 0)} pt
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!canEdit || indicators.length <= 1}
                  onClick={() => removeIndicator(indicator)}
                  aria-label={`Rimuovi ${indicator}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Scala e soglia"
            description="La conversione in decimi usa la scala selezionata. La soglia di sufficienza vale 6."
          />
          <CardBody className="space-y-3">
            <Field label="Scala di conversione">
              <Select value={gradeScaleId} disabled={!canEdit} onChange={(event) => setGradeScaleId(event.target.value)}>
                <option value="">Nessuna scala collegata</option>
                {gradeScales.map((scale) => (
                  <option key={scale.id} value={scale.id}>
                    {scale.name}
                    {scale.isDefault ? " (predefinita)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Soglia sufficienza (pt)">
                <Input
                  type="number"
                  min={0}
                  max={test.totalPoints}
                  step={0.5}
                  value={threshold}
                  disabled={!canEdit}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                />
              </Field>
              <Field label="Modalità">
                <Select value={mode} disabled={!canEdit} onChange={(event) => setMode(event.target.value)}>
                  <option value="lineare">Lineare</option>
                  <option value="scaglioni">A scaglioni</option>
                </Select>
              </Field>
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Con {test.totalPoints} punti, la soglia corrisponde al{" "}
              <strong>{test.totalPoints > 0 ? Math.round((threshold / test.totalPoints) * 100) : 0}%</strong>. La modifica
              della soglia si applica alla scala salvata: verifica che sia quella giusta per il dipartimento.
            </p>
            {activeScale && activeScale.totalPoints !== test.totalPoints ? (
              <Notice tone="warning">
                La scala «{activeScale.name}» è tarata su {activeScale.totalPoints} punti, la verifica su {test.totalPoints}.
                La conversione usa comunque il totale della verifica.
              </Notice>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {mode === "scaglioni" ? (
        <Card>
          <CardHeader
            title="Fasce di conversione"
            description="La fascia con la percentuale più alta non superata determina il voto."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit}
                onClick={() => setBands((prev) => [...prev, { minPercent: 0, grade: 6 }])}
              >
                <Plus className="h-3.5 w-3.5" />
                Fascia
              </Button>
            }
          />
          <CardBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[...bands]
              .map((band, index) => ({ band, index }))
              .sort((a, b) => a.band.minPercent - b.band.minPercent)
              .map(({ band, index }) => (
                <div key={index} className="flex items-end gap-1.5 rounded-lg border bg-muted/20 p-2">
                  <Field label="% minima" className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={band.minPercent}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setBands((prev) =>
                          prev.map((entry, i) => (i === index ? { ...entry, minPercent: Number(event.target.value) } : entry)),
                        )
                      }
                    />
                  </Field>
                  <Field label="Voto" className="w-20">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      step={0.25}
                      value={band.grade}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setBands((prev) =>
                          prev.map((entry, i) => (i === index ? { ...entry, grade: Number(event.target.value) } : entry)),
                        )
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!canEdit || bands.length <= 1}
                    onClick={() => setBands((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Rimuovi fascia"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Livelli e descrittori"
          description="I descrittori compaiono nella griglia stampata e guidano la valutazione per indicatori."
        />
        <CardBody className="space-y-2.5">
          {levels.map((level, index) => (
            <div key={index} className="grid gap-2 rounded-lg border bg-muted/15 p-3 sm:grid-cols-[64px_150px_1fr_auto]">
              <div className="flex items-center">
                <Badge tone="blue">Liv. {level.level}</Badge>
              </div>
              <Input
                value={level.label}
                disabled={!canEdit}
                aria-label={`Etichetta livello ${level.level}`}
                onChange={(event) =>
                  setLevels((prev) => prev.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))
                }
              />
              <Textarea
                value={level.descriptor}
                rows={2}
                disabled={!canEdit}
                aria-label={`Descrittore livello ${level.level}`}
                onChange={(event) =>
                  setLevels((prev) =>
                    prev.map((entry, i) => (i === index ? { ...entry, descriptor: event.target.value } : entry)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!canEdit || levels.length <= 2}
                onClick={() =>
                  setLevels((prev) => prev.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, level: i + 1 })))
                }
                aria-label="Rimuovi livello"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || levels.length >= 6}
            onClick={() =>
              setLevels((prev) => [...prev, { level: prev.length + 1, label: "", descriptor: "" }])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Aggiungi livello
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Associazione quesiti → indicatori"
          description="Seleziona gli indicatori valutati da ciascun quesito. I punti sono ripartiti equamente tra gli indicatori scelti."
        />
        <CardBody className="space-y-2">
          {test.items.map((item, index) => (
            <div key={item.id} className="flex flex-wrap items-start gap-2 rounded-lg border bg-muted/15 px-3 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card text-[11px] font-bold text-primary">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[12.5px]">{item.prompt}</p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {formatPoints(item.points)} pt · {item.topicName ?? "senza argomento"}
                </p>
              </div>
              <div className="flex max-w-full flex-wrap gap-1">
                {indicators.map((indicator) => {
                  const selected = (mapping[item.id] ?? []).includes(indicator);
                  return (
                    <button
                      key={indicator}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleMapping(item.id, indicator)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition",
                        selected
                          ? "border-primary/40 bg-primary/[0.08] text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30",
                        !canEdit && "cursor-default opacity-80",
                      )}
                    >
                      {indicator}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Conversione punti → voto"
          description={`Tabella calcolata su ${test.totalPoints} punti con soglia ${threshold} pt.`}
        />
        <div className="max-h-[360px] overflow-auto">
          <table className="table-base">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th>Percentuale</th>
                <th>Punti</th>
                <th>Voto</th>
              </tr>
            </thead>
            <tbody>
              {gradeRows.map((row) => (
                <tr key={row.percent} className={Math.abs(row.score - threshold) < 0.001 ? "bg-amber-50/60" : undefined}>
                  <td className="text-[12.5px]">{row.percent}%</td>
                  <td className="text-[12.5px]">{formatPoints(row.score)}</td>
                  <td>
                    <Badge tone={row.grade >= 6 ? "green" : "red"}>{formatPoints(row.grade)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {localError ? <Notice tone="error">{localError}</Notice> : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            La griglia salvata viene usata nell&apos;export e nella conversione in decimi.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset} disabled={working}>
              <RotateCcw className="h-3.5 w-3.5" />
              Ripristina
            </Button>
            <Button type="button" size="sm" loading={working} onClick={() => void save()}>
              {working ? null : <Save className="h-3.5 w-3.5" />}
              Salva griglia
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
