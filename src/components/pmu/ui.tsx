import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { Decision } from "@/lib/pmu/reliability";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border pb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}

export function SectionCard({
  title,
  subtitle,
  right,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("gap-4 rounded-lg py-5 shadow-none", className)}>
      <CardHeader className="gap-1 px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.1em] text-foreground">
              {title}
            </CardTitle>
            {subtitle ? <CardDescription className="mt-1 text-xs">{subtitle}</CardDescription> : null}
          </div>
          {right}
        </div>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

export function Formula({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <figure className="rounded-md border border-border bg-secondary/70 px-4 py-3">
      <div className="mono-num overflow-x-auto text-[13px] leading-relaxed text-foreground">{children}</div>
      {label ? <figcaption className="mt-2 text-xs text-muted-foreground">{label}</figcaption> : null}
    </figure>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  footer,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "neutral" | "stable" | "unstable" | "uncertain";
  footer?: ReactNode;
}) {
  const toneClass = {
    neutral: "text-foreground",
    stable: "text-stable",
    unstable: "text-unstable",
    uncertain: "text-uncertain",
  }[tone];
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        {hint ? (
          <Tooltip>
            <TooltipTrigger aria-label={`About ${label}`}>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className={cn("mono-num mt-2 text-2xl font-semibold", toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </p>
      {footer ? <div className="mt-2 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  const map: Record<Decision, string> = {
    Stable: "bg-stable text-stable-foreground",
    Unstable: "bg-unstable text-unstable-foreground",
    Uncertain: "bg-uncertain text-uncertain-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        map[decision],
        className,
      )}
    >
      {decision}
    </span>
  );
}

export function DecisionBanner({
  decision,
  message,
}: {
  decision: Decision;
  message: string;
}) {
  const tone: Record<Decision, string> = {
    Stable: "border-stable/40 bg-stable/10",
    Unstable: "border-unstable/40 bg-unstable/10",
    Uncertain: "border-uncertain/50 bg-uncertain/10",
  };
  const text: Record<Decision, string> = {
    Stable: "text-stable",
    Unstable: "text-unstable",
    Uncertain: "text-uncertain",
  };
  return (
    <div className={cn("rounded-lg border-2 px-6 py-5", tone[decision])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Physics-calibrated decision
      </p>
      <p className={cn("mt-1 text-3xl font-bold uppercase tracking-[0.06em]", text[decision])}>{decision}</p>
      <p className="mt-2 max-w-2xl text-sm text-foreground/80">{message}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        Decision support only. This prototype does not command switching, tripping or load shedding, and is not a
        certified grid protection system.
      </p>
    </div>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-uncertain/50 bg-uncertain/10 px-4 py-3 text-xs leading-relaxed text-foreground/85">
      {children}
    </div>
  );
}

export function StatusPill({ status, children }: { status: "completed" | "warning" | "skipped"; children: ReactNode }) {
  const map = {
    completed: "border-stable/40 bg-stable/10 text-stable",
    warning: "border-uncertain/50 bg-uncertain/15 text-uncertain",
    skipped: "border-border bg-muted text-muted-foreground",
  } as const;
  return (
    <Badge variant="outline" className={cn("rounded-sm text-[11px] font-semibold", map[status])}>
      {children}
    </Badge>
  );
}

export function KeyValue({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.k}>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{it.k}</dt>
          <dd className="mono-num mt-0.5 text-sm text-foreground">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function fmt(v: number | null | undefined, digits = 3) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  return v.toFixed(digits);
}