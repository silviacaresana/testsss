"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronRight,
  FileText,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { apiFetch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const primaryNav = [
  { href: "/dashboard", label: "Panoramica", icon: LayoutDashboard },
  { href: "/verifiche", label: "Verifiche", icon: FileText },
  { href: "/programmi", label: "Programmi", icon: BookOpen },
  { href: "/banca", label: "Banca quesiti", icon: Library },
];

const adminNav = [
  { href: "/amministrazione", label: "Amministrazione", icon: Gauge },
  { href: "/amministrazione/utenti", label: "Docenti e inviti", icon: ShieldCheck },
  { href: "/amministrazione/impostazioni", label: "Impostazioni", icon: Settings },
  { href: "/amministrazione/log", label: "Log e consumi", icon: GraduationCap },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* il cookie viene comunque invalidato lato server, se possibile */
    }
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-border/80 bg-card/95 backdrop-blur transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" aria-label="VerificheLab, panoramica">
            <Logo />
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Chiudi menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3">
          <Link
            href="/verifiche/nuova"
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nuova verifica
          </Link>
        </div>

        <nav className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Lavoro
          </p>
          <ul className="space-y-0.5">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                    isActive(item.href)
                      ? "bg-primary/[0.08] text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {isActive(item.href) ? <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" /> : null}
                </Link>
              </li>
            ))}
          </ul>

          {user.role === "admin" ? (
            <>
              <p className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                Dipartimento
              </p>
              <ul className="space-y-0.5">
                {adminNav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                        isActive(item.href)
                          ? "bg-primary/[0.08] text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="mt-6 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Account
          </p>
          <ul>
            <li>
              <Link
                href="/profilo"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                  isActive("/profilo")
                    ? "bg-primary/[0.08] text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <UserRound className="h-4 w-4" />
                Profilo e preferenze
              </Link>
            </li>
          </ul>
        </nav>

        <div className="border-t px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-secondary-foreground">
              {initials(user.name) || "VL"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user.role === "admin" ? "Referente di dipartimento" : "Docente"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start px-2 text-muted-foreground"
            onClick={logout}
            loading={loggingOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Esci
          </Button>
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-foreground"
            aria-label="Apri menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link href="/dashboard">
            <Logo compact />
          </Link>
          <Link
            href="/verifiche/nuova"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuova
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>

        <footer className="mx-auto w-full max-w-[1180px] px-4 pb-6 text-[11px] text-muted-foreground sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
            <span>VerificheLab · uso interno del dipartimento</span>
            <span>LaTeX · PDF · soluzioni · griglie</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
