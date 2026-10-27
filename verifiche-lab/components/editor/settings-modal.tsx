"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import type { SerializedTest } from "@/lib/tests/repository";
import { DIFFICULTY_TABLE, subjectLabel, trackLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";

interface MetaForm {
  title: string;
  classLabel: string;
  examDate: string;
  durationMin: number;
  totalPoints: number;
  difficultyTarget: number;
  calculatorAllowed: boolean;
  formulaSheet: boolean;
  trigTables: boolean;
  noDerivatives: boolean;
  onlyDefinitions: boolean;
  simplifiedLanguage: boolean;
  answerSpace: boolean;
}

function fromTest(test: SerializedTest): MetaForm {
  return {
    title: test.title,
    classLabel: test.classLabel,
    examDate: test.examDate ? test.examDate.slice(0, 10) : "",
    durationMin: test.durationMin,
    totalPoints: test.totalPoints,
    difficultyTarget: test.difficultyTarget,
    calculatorAllowed: test.calculatorAllowed,
    formulaSheet: test.formulaSheet,
    trigTables: test.trigTables,
    noDerivatives: test.noDerivatives,
    onlyDefinitions: test.onlyDefinitions,
    simplifiedLanguage: test.simplifiedLanguage,
    answerSpace: test.answerSpace,
  };
}

export function SettingsModal({
  open,
  test,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: {
  open: boolean;
  test: SerializedTest;
  onClose: () => void;
  onSaved: (test: SerializedTest, suggestion: string | null) => void;
  onError: (message: string, issues?: string[]) => void;
  onSuccess: (message: string) => void;
}) {
  const [form, setForm] = useState<MetaForm>(() => fromTest(test));
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(fromTest(test));
      setLocalError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle<K extends keyof MetaForm>(key: K, value: MetaForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (form.title.trim().length < 3) {
      setLocalError("Il titolo deve avere almeno 3 caratteri.");
      return;
    }
    if (form.totalPoints < 1) {
      setLocalError("Il punteggio totale deve essere maggiore di zero.");
      return;
    }
    if (form.durationMin < 20 || form.durationMin > 240) {
      setLocalError("La durata deve essere compresa tra 20 e 240 minuti.");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      const data = await apiFetch<{ test: SerializedTest; suggestion: string | null }>(`/api/tests/${test.id}`, {
        method: "PATCH",
        body: {
          title: form.title.trim(),
          classLabel: form.classLabel,
          examDate: form.examDate || null,
          durationMin: form.durationMin,
          totalPoints: form.totalPoints,
          difficultyTarget: form.difficultyTarget,
          calculatorAllowed: form.calculatorAllowed,
          formulaSheet: form.formulaSheet,
          trigTables: form.trigTables,
          noDerivatives: form.noDerivatives,
          onlyDefinitions: form.onlyDefinitions,
          simplifiedLanguage: form.simplifiedLanguage,
          answerSpace: form.answerSpace,
        },
      });
      onSaved(data.test, data.suggestion);
      onSuccess("Impostazioni della verifica aggiornate.");
      onClose();
    } catch (error) {
      onError(
        error instanceof ApiError ? error.message : "Impossibile salvare le impostazioni.",
        error instanceof ApiError ? error.issues : undefined,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Impostazioni verifica"
      description="Titolo, classe, tempi e vincoli didattici. Le modifiche riportano la verifica in bozza."
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            <Settings2 className="h-3.5 w-3.5" />
            Salva impostazioni
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 px-3.5 py-3 text-[12px] text-muted-foreground">
          <p>
            <strong className="text-foreground">{subjectLabel(test.subject)}</strong> · {trackLabel(test.track)} · {test.year}ª
            {test.curriculumTitle ? ` · programma «${test.curriculumTitle}»` : " · senza programma collegato"}
          </p>
          <p className="mt-1">Indirizzo, anno, materia e programma restano fissi: per cambiarli crea una nuova verifica.</p>
        </div>

        <Field label="Titolo" required>
          <Input value={form.title} maxLength={160} onChange={(event) => toggle("title", event.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Classe / sezione">
            <Input
              value={form.classLabel}
              maxLength={60}
              placeholder="Es. 3ª B"
              onChange={(event) => toggle("classLabel", event.target.value)}
            />
          </Field>
          <Field label="Data della prova">
            <Input type="date" value={form.examDate} onChange={(event) => toggle("examDate", event.target.value)} />
          </Field>
          <Field label="Durata (minuti)" hint="20–240; tolleranza tempo ±10%">
            <Input
              type="number"
              min={20}
              max={240}
              value={form.durationMin}
              onChange={(event) => toggle("durationMin", Number(event.target.value))}
            />
          </Field>
          <Field label="Punteggio totale" hint="Intero o multiplo di 0,25">
            <Input
              type="number"
              min={1}
              max={200}
              step={0.25}
              value={form.totalPoints}
              onChange={(event) => toggle("totalPoints", Number(event.target.value))}
            />
          </Field>
          <Field label="Difficoltà media">
            <Select
              value={String(form.difficultyTarget)}
              onChange={(event) => toggle("difficultyTarget", Number(event.target.value))}
            >
              {DIFFICULTY_TABLE.map((level) => (
                <option key={level.level} value={level.level}>
                  {level.level} · {level.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <p className="label-base">Strumenti e adattamenti</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Checkbox
              label="Calcolatrice consentita"
              description="Indicato nell'intestazione e nei criteri."
              checked={form.calculatorAllowed}
              onChange={(event) => toggle("calculatorAllowed", event.target.checked)}
            />
            <Checkbox
              label="Formulario allegato"
              description="Le formule essenziali compaiono in apertura."
              checked={form.formulaSheet}
              onChange={(event) => toggle("formulaSheet", event.target.checked)}
            />
            <Checkbox
              label="Tavole trigonometriche"
              checked={form.trigTables}
              onChange={(event) => toggle("trigTables", event.target.checked)}
            />
            <Checkbox
              label="Spazio risposta"
              description="Righe o riquadri dopo ogni quesito."
              checked={form.answerSpace}
              onChange={(event) => toggle("answerSpace", event.target.checked)}
            />
            <Checkbox
              label="Senza derivate"
              description="Vincolo per il biennio o per il Classico."
              checked={form.noDerivatives}
              onChange={(event) => toggle("noDerivatives", event.target.checked)}
            />
            <Checkbox
              label="Solo definizioni e proprietà"
              description="Esclude esercizi di calcolo avanzato."
              checked={form.onlyDefinitions}
              onChange={(event) => toggle("onlyDefinitions", event.target.checked)}
            />
            <Checkbox
              label="Linguaggio semplificato"
              description="Frasi più brevi e consegne esplicite."
              checked={form.simplifiedLanguage}
              onChange={(event) => toggle("simplifiedLanguage", event.target.checked)}
            />
          </div>
        </div>

        {localError ? <Notice tone="error">{localError}</Notice> : null}
      </div>
    </Modal>
  );
}
