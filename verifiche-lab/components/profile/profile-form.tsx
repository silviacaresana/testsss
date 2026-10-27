"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Save, UserRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { SUBJECTS, TRACKS } from "@/lib/constants";
import { formatDateTimeIT } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

interface ProfileUser {
  name: string;
  email: string;
  role: string;
  subjects: string[];
  tracks: string[];
}

interface ProfileStats {
  tests: number;
  curricula: number;
  bank: number;
  lastLogin: string | null;
  createdAt: string | null;
}

type Feedback = { tone: "success" | "error"; message: string; issues?: string[] };

export function ProfileForm({ user, stats }: { user: ProfileUser; stats: ProfileStats }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: user.name,
    subjects: user.subjects,
    tracks: user.tracks,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function toggle(list: "subjects" | "tracks", value: string) {
    setForm((prev) => ({
      ...prev,
      [list]: prev[list].includes(value) ? prev[list].filter((entry) => entry !== value) : [...prev[list], value],
    }));
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      if (form.newPassword && form.newPassword !== form.confirmPassword) {
        throw new Error("La conferma della nuova password non corrisponde.");
      }
      await apiFetch("/api/auth/profile", {
        method: "PATCH",
        body: {
          name: form.name,
          subjects: form.subjects,
          tracks: form.tracks,
          ...(form.newPassword ? { currentPassword: form.currentPassword, newPassword: form.newPassword } : {}),
        },
      });
      setForm((prev) => ({ ...prev, currentPassword: "", newPassword: "", confirmPassword: "" }));
      setFeedback({ tone: "success", message: "Profilo aggiornato." });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Salvataggio non riuscito.",
        issues: error instanceof ApiError ? error.issues : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <div className="space-y-4">
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

        <Card>
          <CardHeader
            title="Dati personali"
            description="Il nome compare come autore di verifiche e programmi."
            icon={<UserRound className="h-4 w-4" />}
            action={<Badge tone="neutral">{user.role === "admin" ? "amministratore" : "docente"}</Badge>}
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome e cognome" required>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </Field>
              <Field label="Email" hint="Per cambiare email chiedi a un amministratore.">
                <Input value={user.email} disabled />
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Password"
            description="Lascia vuoto per non cambiarla. Dopo il cambio, le altre sessioni vengono chiuse."
            icon={<KeyRound className="h-4 w-4" />}
          />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <Field label="Password attuale">
              <Input
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
              />
            </Field>
            <Field label="Nuova password" hint="Almeno 8 caratteri.">
              <Input
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              />
            </Field>
            <Field label="Conferma nuova password">
              <Input
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              />
            </Field>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button type="button" loading={busy} onClick={() => void save()}>
            <Save className="h-4 w-4" />
            Salva profilo
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Attività" />
          <div className="divide-y text-[13px]">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Verifiche</span>
              <span className="font-semibold">{stats.tests}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Programmi</span>
              <span className="font-semibold">{stats.curricula}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Quesiti in banca</span>
              <span className="font-semibold">{stats.bank}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <CardBody className="space-y-1.5 text-[11.5px] text-muted-foreground">
            <p>Ruolo: {user.role === "admin" ? "referente di dipartimento" : "docente"}</p>
            <p>Ultimo accesso: {stats.lastLogin ? formatDateTimeIT(stats.lastLogin) : "—"}</p>
            <p>Account creato: {stats.createdAt ? formatDateTimeIT(stats.createdAt) : "—"}</p>
            <p className="pt-1">
              L&apos;account è riservato al personale del dipartimento: non esiste registrazione pubblica.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
