"use client";

import { useState } from "react";
import { Gauge, Save, Sparkles, School } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

interface SettingField {
  key: string;
  label: string;
  group: "istituto" | "ai" | "latex";
  type: "text" | "number" | "select" | "boolean";
  help?: string;
  options?: { value: string; label: string }[];
  secret?: boolean;
}

const GROUP_INFO: Record<string, { title: string; description: string }> = {
  istituto: {
    title: "Istituto",
    description: "Intestazione di verifiche, soluzioni e griglie stampate.",
  },
  ai: {
    title: "Generatore",
    description: "Provider, modello e limiti. La modalità offline funziona senza chiavi e senza costi.",
  },
  latex: {
    title: "LaTeX",
    description: "Motore usato per compilare i PDF. Tectonic è autosufficiente; pdflatex richiede un'installazione locale.",
  },
};

export function AdminSettings({
  fields,
  initialValues,
  apiKeyMasked,
  envProvider,
}: {
  fields: SettingField[];
  initialValues: Record<string, string>;
  apiKeyMasked: string;
  envProvider: string;
}) {
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string; issues?: string[] } | null>(null);

  function update(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      const payload = Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ""]));
      await apiFetch("/api/admin/settings", { method: "PUT", body: payload });
      setFeedback({ tone: "success", message: "Impostazioni salvate." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Salvataggio non riuscito.",
        issues: error instanceof ApiError ? error.issues : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const groups: ("istituto" | "ai" | "latex")[] = ["istituto", "ai", "latex"];

  return (
    <div className="space-y-5">
      {feedback ? (
        <Notice
          tone={feedback.tone}
          action={
            <Button type="button" variant="ghost" size="sm" onClick={() => setFeedback(null)}>
              Chiudi
            </Button>
          }
        >
          <p>{feedback.message}</p>
          {feedback.issues && feedback.issues.length > 0 ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {feedback.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}

      {groups.map((group) => {
        const groupFields = fields.filter((field) => field.group === group);
        const info = GROUP_INFO[group];
        return (
          <Card key={group}>
            <CardHeader
              title={info.title}
              description={info.description}
              icon={group === "istituto" ? <School className="h-4 w-4" /> : group === "ai" ? <Sparkles className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
              action={
                group === "ai" ? (
                  <Badge tone={values["ai.provider"] === "offline" ? "green" : "violet"}>
                    {values["ai.provider"] === "offline" ? "offline" : "provider attivo"}
                  </Badge>
                ) : null
              }
            />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {groupFields.map((field) => {
                const value = values[field.key] ?? "";
                if (field.type === "boolean") {
                  return (
                    <div key={field.key} className="sm:col-span-2">
                      <Checkbox
                        label={field.label}
                        description={field.help}
                        checked={value === "true"}
                        onChange={(event) => update(field.key, event.target.checked ? "true" : "false")}
                      />
                    </div>
                  );
                }
                return (
                  <Field
                    key={field.key}
                    label={field.label}
                    hint={field.help}
                    className={field.key === "institute.logoPath" ? "sm:col-span-2" : undefined}
                  >
                    {field.type === "select" ? (
                      <Select value={value} onChange={(event) => update(field.key, event.target.value)}>
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    ) : field.type === "number" ? (
                      <Input
                        type="number"
                        min={0}
                        step={field.key === "ai.monthlyBudget" ? "0.5" : "1"}
                        value={value}
                        onChange={(event) => update(field.key, event.target.value)}
                      />
                    ) : (
                      <Input value={value} onChange={(event) => update(field.key, event.target.value)} />
                    )}
                  </Field>
                );
              })}

              {group === "ai" ? (
                <div className="sm:col-span-2 rounded-lg border bg-muted/25 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12.5px] font-semibold">Chiave API</p>
                    <Badge tone={apiKeyMasked === "non configurata" ? "amber" : "green"}>{apiKeyMasked}</Badge>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    La chiave non si modifica dal pannello: impostala come variabile d&apos;ambiente <code>AI_API_KEY</code> sul
                    server e riavvia l&apos;applicazione. Provider da ambiente: <strong>{envProvider}</strong>.
                  </p>
                </div>
              ) : null}
            </CardBody>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-[11.5px] leading-relaxed text-muted-foreground">
          Le modifiche hanno effetto dalla successiva generazione o esportazione. Se il motore LaTeX non è disponibile, il
          sistema conserva comunque il file <code>.tex</code> scaricabile.
        </p>
        <Button type="button" loading={busy} onClick={() => void save()}>
          <Save className="h-4 w-4" />
          Salva impostazioni
        </Button>
      </div>
    </div>
  );
}
