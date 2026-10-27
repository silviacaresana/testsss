"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, UserPlus } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { SUBJECTS, TRACKS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function InviteForm({
  token,
  email,
  role,
  inviterName,
}: {
  token: string;
  email: string;
  role: string;
  inviterName: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    password: "",
    confirmPassword: "",
    subjects: [] as string[],
    tracks: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: "subjects" | "tracks", value: string) {
    setForm((prev) => ({
      ...prev,
      [list]: prev[list].includes(value) ? prev[list].filter((entry) => entry !== value) : [...prev[list], value],
    }));
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      if (form.password !== form.confirmPassword) {
        throw new Error("Le due password non corrispondono.");
      }
      await apiFetch("/api/auth/invite", {
        method: "POST",
        body: {
          token,
          name: form.name,
          password: form.password,
          subjects: form.subjects,
          tracks: form.tracks,
        },
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Attivazione non riuscita.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="I tuoi dati"
        description={`Invito creato da ${inviterName}. Il ruolo assegnato è ${role === "admin" ? "amministratore" : "docente"}.`}
        icon={<BadgeCheck className="h-4 w-4" />}
      />
      <CardBody className="space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome e cognome" required>
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </Field>
          <Field label="Email">
            <Input value={email} disabled />
          </Field>
          <Field label="Password" required hint="Almeno 10 caratteri.">
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </Field>
          <Field label="Conferma password" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            />
          </Field>
        </div>

        <div>
          <p className="label-base">Materie insegnate</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SUBJECTS.map((subject) => (
              <Checkbox
                key={subject.value}
                label={subject.label}
                checked={form.subjects.includes(subject.value)}
                onChange={() => toggle("subjects", subject.value)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="label-base">Indirizzi</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRACKS.map((track) => (
              <Checkbox
                key={track.value}
                label={track.label}
                checked={form.tracks.includes(track.value)}
                onChange={() => toggle("tracks", track.value)}
              />
            ))}
          </div>
        </div>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Proseguendo accetti che il tuo nome compaia come autore di verifiche e programmi all&apos;interno del dipartimento.
          Non inserire dati personali degli studenti.
        </p>

        <div className="flex justify-end">
          <Button type="button" loading={busy} onClick={() => void activate()}>
            <UserPlus className="h-4 w-4" />
            Attiva account
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
