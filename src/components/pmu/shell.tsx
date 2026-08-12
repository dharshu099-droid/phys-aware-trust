import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { usePmu } from "@/lib/pmu/store";
import { DecisionBadge } from "./ui";

export const NAV = [
  { to: "/", label: "Overview" },
  { to: "/pmu-event-data", label: "PMU Event Data" },
  { to: "/early-prediction", label: "Early Prediction" },
  { to: "/ai-model", label: "AI Model" },
  { to: "/uncertainty", label: "Uncertainty" },
  { to: "/physics-consistency", label: "Physics Consistency" },
  { to: "/reliability", label: "Reliability Assessment" },
  { to: "/stress-testing", label: "Stress Testing" },
  { to: "/evaluation", label: "Evaluation" },
  { to: "/architecture", label: "Architecture" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { event, cfg, result } = usePmu();
  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto">
        <div className="border-b border-sidebar-border px-5 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-primary">
            Research prototype
          </p>
          <p className="mt-2 text-sm font-semibold leading-snug">
            Physics-Calibrated Uncertainty-Aware Transformer
          </p>
          <p className="mt-1 text-xs text-sidebar-foreground/70">
            Reliable early power-system stability assessment
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 px-3 py-3 lg:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-sm px-3 py-2 text-xs font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mx-3 mb-4 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
            Current pipeline state
          </p>
          <p className="mono-num mt-2 text-[11px] text-sidebar-foreground/85">{event.id}</p>
          <p className="mono-num text-[11px] text-sidebar-foreground/85">
            window {cfg.windowMs} ms · K = {cfg.K} · f₀ = {cfg.nominalFrequency} Hz
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DecisionBadge decision={result.rel.decision} />
            <span className="mono-num text-[11px] text-sidebar-foreground/75">
              p̄ {result.unc.pbar.toFixed(2)} · S {result.rel.Srel.toFixed(2)}
            </span>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-7 lg:px-9 lg:py-9">
        <div className="mx-auto max-w-6xl space-y-7">{children}</div>
        <footer className="mx-auto mt-12 max-w-6xl border-t border-border pt-5 text-[11px] leading-relaxed text-muted-foreground">
          Research demonstration for power-grid operator decision support. Not a certified grid protection system, not
          validated for real-time deployment, and not a source of experimental performance claims. Built-in waveforms are
          clearly labelled illustrative demo events, not Transmission Signature Library records or field measurements.
        </footer>
      </main>
    </div>
  );
}