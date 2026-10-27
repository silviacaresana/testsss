import Link from "next/link";
import { MailX } from "lucide-react";
import { getInviteByToken } from "@/lib/admin/invites";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { InviteForm } from "@/components/auth/invite-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Attiva l'account" };

type Params = Promise<{ token: string }>;

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const invite = await getInviteByToken(token).catch(() => null);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <Link href="/login" className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
          Torna al login
        </Link>
      </div>

      {!invite ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<MailX className="h-6 w-6" />}
              title="Invito non valido"
              description="Il link è scaduto, è già stato utilizzato oppure non esiste. Chiedi a un amministratore di creare un nuovo invito."
              action={
                <ButtonLink href="/login" variant="outline" size="sm">
                  Vai al login
                </ButtonLink>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="mb-5">
            <p className="kicker mb-1.5">Invito al dipartimento</p>
            <h1 className="text-[28px] font-semibold leading-tight">Attiva il tuo account</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Sei stato invitato come {invite.role === "admin" ? "amministratore" : "docente"} con l&apos;indirizzo{" "}
              <strong>{invite.email}</strong>. Completa i dati per entrare in VerificheLab.
            </p>
          </div>
          <InviteForm token={token} email={invite.email} role={invite.role} inviterName={invite.createdBy.name} />
        </>
      )}

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        VerificheLab non raccoglie dati degli studenti. L&apos;accesso è riservato al personale del dipartimento.
      </p>
    </div>
  );
}
