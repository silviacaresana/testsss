import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  meta,
  className,
}: {
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {kicker ? <p className="kicker mb-1.5">{kicker}</p> : null}
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">{title}</h1>
        {description ? (
          <div className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-[12px] text-muted-foreground" aria-label="Percorso">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <ChevronRight className="h-3 w-3 opacity-60" /> : null}
          {item.href ? (
            <Link href={item.href} className="transition hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground/80">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Stat({
  label,
  value,
  note,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "accent";
}) {
  const valueClass =
    tone === "primary" ? "text-primary" : tone === "accent" ? "text-amber-700" : "text-foreground";
  return (
    <div className="surface px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground/70">{icon}</span> : null}
      </div>
      <p className={cn("mt-1.5 font-serif text-[26px] font-semibold leading-none", valueClass)}>{value}</p>
      {note ? <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{note}</p> : null}
    </div>
  );
}
