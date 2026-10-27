import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpenCheck, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/ui/logo";

export const dynamic = "force-dynamic";

const highlights = [
  {
    icon: Sparkles,
    title: "L'AI propone, il docente approva",
    text: "Bozze argomento per argomento, sempre modificabili. La versione ufficiale nasce solo dalla tua validazione.",
  },
  {
    icon: FileText,
    title: "LaTeX e PDF, non un'immagine",
    text: "Sorgente versionato, compilabile e scaricabile: verifica, soluzioni svolte e griglia di valutazione.",
  },
  {
    icon: BookOpenCheck,
    title: "Programmi del dipartimento",
    text: "Classico e Scientifico, cinque anni, Matematica e Fisica. Ogni verifica resta ancorata al programma.",
  },
  {
    icon: ShieldCheck,
    title: "Nessun dato degli studenti",
    text: "Solo docenti e materiali didattici. Accesso su invito, log delle operazioni, permessi per ruolo.",
  },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-primary px-12 py-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, #fff 0, transparent 26%), radial-gradient(circle at 78% 72%, #f2c879 0, transparent 30%), repeating-linear-gradient(115deg, transparent 0 46px, rgba(255,255,255,0.16) 46px 47px)",
          }}
        />
        <div className="relative">
          <Logo className="[&_span:last-child]:text-primary-foreground" />
          <p className="mt-16 max-w-lg font-serif text-[38px] leading-[1.12] text-primary-foreground">
            Il dipartimento scrive il programma.{" "}
            <span className="text-[#f2c879]">La verifica nasce da lì.</span>
          </p>
          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-primary-foreground/75">
            VerificheLab accompagna Matematica e Fisica dal curricolo alla stampa: consegne, soluzioni,
            griglie e conversione in decimi, con la differenza tra Liceo Classico e Scientifico
            esplicitata in ogni scelta.
          </p>
        </div>
        <div className="relative mt-12 grid gap-4 sm:grid-cols-2">
          {highlights.map((item) => (
            <div key={item.title} className="rounded-xl border border-white/15 bg-white/[0.06] p-4 backdrop-blur-sm">
              <item.icon className="h-4 w-4 text-[#f2c879]" aria-hidden />
              <p className="mt-2.5 text-[13px] font-semibold">{item.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-primary-foreground/65">{item.text}</p>
            </div>
          ))}
        </div>
        <p className="relative mt-10 text-[11px] uppercase tracking-[0.18em] text-primary-foreground/45">
          Uso interno · Dipartimento di Matematica e Fisica
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <p className="kicker">Area riservata ai docenti</p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight">Bentornata, bentornato.</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Accedi con le credenziali fornite dal referente di dipartimento. Non è prevista la
            registrazione autonoma.
          </p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-44 animate-pulse rounded-lg bg-muted" />}>
              <LoginForm />
            </Suspense>
          </div>
          <div className="mt-8 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Prima installazione</p>
            <p className="mt-1">
              Gli account demo vengono creati con <code className="rounded bg-card px-1 py-0.5">npm run db:seed</code>.
              Le credenziali sono indicate nel README e vanno cambiate prima dell&apos;uso reale.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
