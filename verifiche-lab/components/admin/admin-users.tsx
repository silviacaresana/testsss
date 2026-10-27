"use client";

import { useState } from "react";
import { Check, Copy, Mail, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/client/api";
import { SUBJECTS, TRACKS } from "@/lib/constants";
import { cn, formatDateIT, formatDateTimeIT } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  subjects: string[];
  tracks: string[];
  lastLogin: string | null;
  createdAt: string;
  testsCount: number;
  curriculaCount: number;
  bankCount: number;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  createdByName: string;
  status: string;
}

type Feedback = { tone: "success" | "error"; message: string; issues?: string[] };

const emptyUserForm = {
  email: "",
  name: "",
  role: "teacher",
  password: "",
  subjects: [] as string[],
  tracks: [] as string[],
};

export function AdminUsers({
  initialUsers,
  initialInvites,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  initialInvites: Invite[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"docenti" | "inviti">("docenti");
  const [users, setUsers] = useState(initialUsers);
  const [invites, setInvites] = useState(initialInvites);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyUserForm);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "teacher", subjects: [] as string[], tracks: [] as string[], password: "" });

  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "teacher" });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(list: "subjects" | "tracks", value: string, target: "create" | "edit") {
    if (target === "create") {
      setCreateForm((prev) => ({
        ...prev,
        [list]: prev[list].includes(value) ? prev[list].filter((entry) => entry !== value) : [...prev[list], value],
      }));
    } else {
      setEditForm((prev) => ({
        ...prev,
        [list]: prev[list].includes(value) ? prev[list].filter((entry) => entry !== value) : [...prev[list], value],
      }));
    }
  }

  async function createUser() {
    setBusy("create");
    setFeedback(null);
    try {
      const result = await apiFetch<{ user: AdminUser }>("/api/admin/users", {
        method: "POST",
        body: createForm,
      });
      setUsers((prev) => [...prev, result.user]);
      setCreateOpen(false);
      setCreateForm(emptyUserForm);
      setFeedback({ tone: "success", message: "Account creato. Comunica le credenziali al docente." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Creazione non riuscita.",
        issues: error instanceof ApiError ? error.issues : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setEditForm({
      name: user.name,
      role: user.role,
      subjects: user.subjects,
      tracks: user.tracks,
      password: "",
    });
  }

  async function saveUser() {
    if (!editing) return;
    setBusy(`edit-${editing.id}`);
    setFeedback(null);
    try {
      const result = await apiFetch<{ user: AdminUser }>(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        body: {
          name: editForm.name,
          role: editForm.role,
          subjects: editForm.subjects,
          tracks: editForm.tracks,
          ...(editForm.password ? { password: editForm.password } : {}),
        },
      });
      setUsers((prev) => prev.map((user) => (user.id === result.user.id ? result.user : user)));
      setEditing(null);
      setFeedback({ tone: "success", message: "Account aggiornato." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Modifica non riuscita.",
        issues: error instanceof ApiError ? error.issues : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function deleteUser() {
    if (!deleting) return;
    setBusy(`delete-${deleting.id}`);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/users/${deleting.id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((user) => user.id !== deleting.id));
      setDeleting(null);
      setFeedback({ tone: "success", message: "Account eliminato." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Eliminazione non riuscita.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function createInvite() {
    setBusy("invite");
    setFeedback(null);
    try {
      const result = await apiFetch<{ invite: Invite; link: string }>("/api/admin/invites", {
        method: "POST",
        body: inviteForm,
      });
      setInvites((prev) => [result.invite, ...prev.filter((invite) => invite.id !== result.invite.id)]);
      setInviteLink(result.link);
      setInviteForm({ email: "", role: "teacher" });
      setCopied(false);
      setFeedback({ tone: "success", message: "Invito creato: condividi il link con il docente." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Creazione dell'invito non riuscita.",
        issues: error instanceof ApiError ? error.issues : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(invite: Invite) {
    setBusy(`revoke-${invite.id}`);
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/invites/${invite.id}`, { method: "DELETE" });
      setInvites((prev) => prev.filter((entry) => entry.id !== invite.id));
      setFeedback({ tone: "success", message: "Invito revocato." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "Revoca non riuscita.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback({ tone: "error", message: "Copia non riuscita: seleziona il link manualmente." });
    }
  }

  const activeInvites = invites.filter((invite) => invite.status === "attivo").length;

  return (
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab("docenti")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition",
              tab === "docenti" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Docenti ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("inviti")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition",
              tab === "inviti" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            Inviti ({activeInvites})
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setInviteOpen(true);
              setInviteLink(null);
            }}
          >
            <Mail className="h-3.5 w-3.5" />
            Crea invito
          </Button>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Nuovo account
          </Button>
        </div>
      </div>

      {tab === "docenti" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="pl-5">Docente</th>
                  <th>Ruolo</th>
                  <th>Materie</th>
                  <th>Indirizzi</th>
                  <th>Attività</th>
                  <th>Ultimo accesso</th>
                  <th className="pr-5" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="pl-5">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground">{user.email}</p>
                    </td>
                    <td>
                      <Badge tone={user.role === "admin" ? "violet" : "neutral"}>
                        {user.role === "admin" ? "amministratore" : "docente"}
                      </Badge>
                    </td>
                    <td className="text-[12px]">
                      {user.subjects.length === 0 ? "—" : user.subjects.map((subject) => (subject === "fisica" ? "Fisica" : "Matematica")).join(", ")}
                    </td>
                    <td className="text-[12px]">
                      {user.tracks.length === 0 ? "—" : user.tracks.map((track) => (track === "classico" ? "Classico" : "Scientifico")).join(", ")}
                    </td>
                    <td className="text-[11.5px] text-muted-foreground">
                      {user.testsCount} verifiche · {user.curriculaCount} programmi · {user.bankCount} quesiti
                    </td>
                    <td className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                      {user.lastLogin ? formatDateTimeIT(user.lastLogin) : "mai"}
                    </td>
                    <td className="whitespace-nowrap pr-5 text-right">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => openEdit(user)}
                        aria-label={`Modifica ${user.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {user.id !== currentUserId ? (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                          onClick={() => setDeleting(user)}
                          aria-label={`Elimina ${user.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Inviti al dipartimento"
            description="Il link è mostrato una sola volta. Alla scadenza, l'invito non è più utilizzabile."
            action={<Badge tone="amber">{activeInvites} attivi</Badge>}
          />
          <div className="divide-y">
            {invites.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">Nessun invito creato.</p>
            ) : (
              invites.map((invite) => (
                <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{invite.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {invite.role === "admin" ? "amministratore" : "docente"} · creato da {invite.createdByName} ·{" "}
                      {formatDateIT(invite.createdAt)} · scade {formatDateIT(invite.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={invite.status === "attivo" ? "green" : invite.status === "usato" ? "blue" : "neutral"}>
                      {invite.status}
                    </Badge>
                    {invite.status === "attivo" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={busy === `revoke-${invite.id}`}
                        onClick={() => void revokeInvite(invite)}
                      >
                        Revoca
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuovo account docente"
        description="L'account è creato direttamente con una password iniziale: comunicala al collega e invitalo a cambiarla."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Annulla
            </Button>
            <Button type="button" loading={busy === "create"} onClick={() => void createUser()}>
              <Plus className="h-3.5 w-3.5" />
              Crea account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome e cognome" required>
              <Input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </Field>
            <Field label="Ruolo">
              <Select value={createForm.role} onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="teacher">Docente</option>
                <option value="admin">Amministratore</option>
              </Select>
            </Field>
            <Field label="Password iniziale" hint="Almeno 10 caratteri.">
              <Input
                type="password"
                autoComplete="new-password"
                value={createForm.password}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </Field>
          </div>
          <div>
            <p className="label-base">Materie</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUBJECTS.map((subject) => (
                <Checkbox
                  key={subject.value}
                  label={subject.label}
                  checked={createForm.subjects.includes(subject.value)}
                  onChange={() => toggle("subjects", subject.value, "create")}
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
                  checked={createForm.tracks.includes(track.value)}
                  onChange={() => toggle("tracks", track.value, "create")}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Modifica ${editing?.name ?? "account"}`}
        description="Se imposti una nuova password, le sessioni attive del docente vengono chiuse."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Annulla
            </Button>
            <Button type="button" loading={busy === `edit-${editing?.id}`} onClick={() => void saveUser()}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Salva
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
            </Field>
            <Field label="Ruolo">
              <Select value={editForm.role} onChange={(event) => setEditForm((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="teacher">Docente</option>
                <option value="admin">Amministratore</option>
              </Select>
            </Field>
            <Field label="Email">
              <Input value={editing?.email ?? ""} disabled />
            </Field>
            <Field label="Nuova password" hint="Lascia vuoto per non cambiarla.">
              <Input
                type="password"
                autoComplete="new-password"
                value={editForm.password}
                onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </Field>
          </div>
          <div>
            <p className="label-base">Materie</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUBJECTS.map((subject) => (
                <Checkbox
                  key={subject.value}
                  label={subject.label}
                  checked={editForm.subjects.includes(subject.value)}
                  onChange={() => toggle("subjects", subject.value, "edit")}
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
                  checked={editForm.tracks.includes(track.value)}
                  onChange={() => toggle("tracks", track.value, "edit")}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invita un docente"
        description="Crea un link monouso valido sette giorni. Il docente completerà nome, password e preferenze."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Chiudi
            </Button>
            <Button type="button" loading={busy === "invite"} onClick={() => void createInvite()}>
              <Mail className="h-3.5 w-3.5" />
              Genera link
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Email del docente" required>
            <Input
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </Field>
          <Field label="Ruolo">
            <Select value={inviteForm.role} onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="teacher">Docente</option>
              <option value="admin">Amministratore</option>
            </Select>
          </Field>

          {inviteLink ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[11.5px] font-medium text-muted-foreground">Link di attivazione</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiato" : "Copia"}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Il link non è recuperabile in seguito: se lo perdi, revoca l&apos;invito e creane un altro.
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Eliminare l'account?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
              Annulla
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy === `delete-${deleting?.id}`}
              onClick={() => void deleteUser()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Elimina account
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {deleting?.name} ({deleting?.email}) verrà eliminato. Se ha verifiche, programmi o quesiti, l&apos;operazione viene
          bloccata: in quel caso cambia il ruolo o reimposta la password.
        </p>
      </Modal>
    </div>
  );
}
