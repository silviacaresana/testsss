import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden>
          <path d="M7 8.5h7.2v15H7zM17.8 8.5H25v15h-7.2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 12h1.4M10 15h1.4M20.8 12h1.4M20.8 15h1.4M20.8 18h1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M14.2 23.5h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16 6.5v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block font-serif text-[19px] font-semibold tracking-tight">VerificheLab</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Matematica · Fisica
          </span>
        </span>
      ) : null}
    </span>
  );
}
