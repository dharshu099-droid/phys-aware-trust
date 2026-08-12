import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePmu } from "@/lib/pmu/store";
import { windowAnalysis } from "@/lib/pmu/inference";
import { WindowSelector } from "@/components/pmu/controls";
import { AreaTrend, SignalChart } from "@/components/pmu/charts";
import { DecisionBadge, DemoNotice, Formula, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHANNELS } from "@/lib/pmu/types";

export const Route = createFileRoute("/early-prediction")({
  head: () => ({
    meta: [
      { title: "Early Prediction Analysis — Observation Window Trade-off" },
      {
        name: "description",
        content:
          "Compare 100, 200, 300 and 500 ms observation windows: instability probability, predictive uncertainty, physics residual and reliability score.",
      },
      { property: "og:title", content: "Early Prediction Analysis" },
      {
        property: "og:description",
        content: "How much evidence does an early PMU observation window carry? Compare four window lengths side by side.",
      },
    ],
  }),
  component: EarlyPredictionPage,
});

function EarlyPredictionPage() {
  const { pre, cfg, result, event } = usePmu();
  const rows = useMemo(() => windowAnalysis(pre, cfg), [pre, cfg]);
  const trend = rows.map((r) => ({
    window: `${r.windowMs} ms`,
    p: Number(r.p.toFixed(4)),
    U: Number(r.U.toFixed(5)),
    Srel: Number(r.Srel.toFixed(4)),
  }));

  const windowStart = pre.event.t[result.seq.startIdx] ?? 0;
  const windowEnd = pre.event.t[result.seq.endIdx] ?? 0;
  const primary = CHANNELS.find((c) => result.seq.channels.includes(c.key));

  return (
    <>
      <PageHeader
        eyebrow="Early prediction analysis"
        title="Observation-Window Selection & Comparison"
        description="Only the early sequence following the disturbance onset is passed to the encoder. Shortening the window buys earlier warning but reduces the evidence available, which is exactly the trade-off the reliability score is designed to expose."
      />

      <SectionCard title="Observation window" subtitle="Presets plus a continuous slider; the waveform highlight updates immediately.">
        <div className="space-y-4">
          <WindowSelector />
          {primary ? (
            <SignalChart
              data={(pre.event.channels[primary.key] ?? []).map((v, i) => ({ t: pre.event.t[i] ?? 0, value: v }))}
              dataKey="value"
              unit={primary.unit}
              yLabel={primary.label}
              eventTime={event.eventTime}
              window={[windowStart, windowEnd]}
              height={210}
            />
          ) : (
            <p className="text-sm text-muted-foreground">All channels are masked — nothing to display.</p>
          )}
          <p className="mono-num text-xs text-muted-foreground">
            Selected window: {cfg.windowMs} ms · t ∈ [{(windowStart * 1000).toFixed(0)}, {(windowEnd * 1000).toFixed(0)}]
            ms · T = {result.seq.T} samples
          </p>
        </div>
      </SectionCard>

      <SectionCard title="PMU sequence representation" subtitle="Feature vectors contain only the channels actually available and unmasked.">
        <div className="space-y-3">
          <Formula label="Sequence of per-sample PMU feature vectors passed to the encoder.">
            X = [x₁, x₂, …, x_T]&nbsp;&nbsp;with&nbsp;&nbsp;x_t = [{result.seq.channels.map((c) => `${c}_t`).join(", ")}]ᵀ
            &nbsp;∈ ℝ^{result.seq.channels.length}
          </Formula>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">t</TableHead>
                  {result.seq.channels.map((c) => (
                    <TableHead key={c} className="text-xs">
                      {c} (z-scored)
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.seq.Xnorm.slice(0, 8).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="mono-num text-xs">x{i + 1}</TableCell>
                    {row.map((v, j) => (
                      <TableCell key={j} className="mono-num text-xs">
                        {v.toFixed(3)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Window comparison for the current event"
        subtitle="Same event, same weights and same configuration; only the observation window changes."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Window</TableHead>
              <TableHead className="text-xs">Samples T</TableHead>
              <TableHead className="text-xs">Probability p̄</TableHead>
              <TableHead className="text-xs">Uncertainty U</TableHead>
              <TableHead className="text-xs">Physics residual R_phy</TableHead>
              <TableHead className="text-xs">Reliability S_rel</TableHead>
              <TableHead className="text-xs">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.windowMs} className={r.windowMs === cfg.windowMs ? "bg-secondary/60" : undefined}>
                <TableCell className="mono-num text-xs font-semibold">{r.windowMs} ms</TableCell>
                <TableCell className="mono-num text-xs">{r.samples}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.p)}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.U, 5)}</TableCell>
                <TableCell className="mono-num text-xs">{r.Rphy === null ? "unavailable" : fmt(r.Rphy)}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.Srel)}</TableCell>
                <TableCell>
                  <DecisionBadge decision={r.decision} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Window vs instability probability">
          <AreaTrend data={trend} dataKey="p" color="var(--chart-1)" />
        </SectionCard>
        <SectionCard title="Window vs predictive uncertainty">
          <AreaTrend data={trend} dataKey="U" color="var(--chart-3)" />
        </SectionCard>
        <SectionCard title="Window vs reliability score">
          <AreaTrend data={trend} dataKey="Srel" color="var(--chart-5)" />
        </SectionCard>
      </div>

      <DemoNotice>
        These curves describe the behaviour of an untrained, deterministically initialised prototype on the selected
        record. They illustrate the earliness / evidence trade-off mechanism — they are not measured detection-time
        results, and no claim is made about how early instability can be detected on real systems.
      </DemoNotice>
    </>
  );
}