import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePmu } from "@/lib/pmu/store";
import { runInference } from "@/lib/pmu/inference";
import { ChannelMask, NoiseControl } from "@/components/pmu/controls";
import { MultiLineChart } from "@/components/pmu/charts";
import { DecisionBadge, DemoNotice, MetricCard, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHANNELS, type ChannelKey } from "@/lib/pmu/types";

export const Route = createFileRoute("/stress-testing")({
  head: () => ({
    meta: [
      { title: "Stress Testing — Noise Robustness & Missing Channels" },
      {
        name: "description",
        content:
          "Inject measurement noise and remove PMU channels to see how uncertainty, physics consistency and the reliability score degrade, and when the framework abstains.",
      },
      { property: "og:title", content: "Stress Testing" },
      {
        property: "og:description",
        content: "Noise sweeps and channel-dropout experiments on the physics-calibrated stability pipeline.",
      },
    ],
  }),
  component: StressPage,
});

const NOISE_LEVELS = [0, 1, 2, 5, 10];

function StressPage() {
  const { pre, cfg, result } = usePmu();

  const noiseRows = useMemo(
    () => NOISE_LEVELS.map((n) => ({ noise: n, r: runInference(pre, cfg, { noisePct: n }) })),
    [pre, cfg],
  );
  const noiseChart = noiseRows.map(({ noise, r }) => ({
    x: noise,
    p: Number(r.unc.pbar.toFixed(4)),
    U: Number((r.unc.U * 10).toFixed(5)),
    Srel: Number(r.rel.Srel.toFixed(4)),
  }));

  const available = CHANNELS.map((c) => c.key).filter((k) => pre.event.channels[k]);
  const ablation = useMemo(
    () =>
      available.map((k) => ({
        removed: k,
        r: runInference(pre, cfg, { maskedChannels: [k] as ChannelKey[] }),
      })),
    [available, pre, cfg],
  );

  return (
    <>
      <PageHeader
        eyebrow="Stress testing"
        title="Noise Robustness and Missing-Channel Behaviour"
        description="A reliability claim is only meaningful if it degrades gracefully. Here the same event is re-analysed under additive measurement noise and under the loss of individual PMU channels, so you can see whether the framework becomes quietly overconfident or correctly moves toward abstention."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Measurement noise" subtitle="Zero-mean Gaussian noise scaled per channel by its own standard deviation.">
          <NoiseControl />
        </SectionCard>
        <SectionCard title="PMU channel availability" subtitle="Simulate a lost sensor or a dropped telemetry channel.">
          <ChannelMask />
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Current noise level" value={`${cfg.noisePct}`} unit="%" hint="applied to every active channel" />
        <MetricCard label="Active channels" value={result.activeChannels.join(", ") || "none"} hint={`${result.activeChannels.length} of ${available.length}`} />
        <MetricCard label="Reliability score" value={fmt(result.rel.Srel)} tone={result.rel.Srel >= cfg.tauR ? "stable" : "uncertain"} />
        <MetricCard
          label="Physics check"
          value={result.physics.available ? `${result.physics.band} residual` : "unavailable"}
          tone={result.physics.available ? "neutral" : "uncertain"}
        />
      </div>

      <SectionCard
        title="Noise sweep"
        subtitle="Same event, same weights; only the injected noise level changes. Uncertainty is plotted ×10 so it stays visible next to the probability."
      >
        <MultiLineChart
          data={noiseChart}
          xKey="x"
          xFormatter={(v) => `${v}%`}
          series={[
            { key: "p", name: "Mean probability p̄", color: "var(--chart-1)" },
            { key: "U", name: "Uncertainty U ×10", color: "var(--chart-3)" },
            { key: "Srel", name: "Reliability S_rel", color: "var(--chart-2)" },
          ]}
          height={250}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Noise</TableHead>
              <TableHead className="text-xs">p̄</TableHead>
              <TableHead className="text-xs">U</TableHead>
              <TableHead className="text-xs">R_phy</TableHead>
              <TableHead className="text-xs">S_rel</TableHead>
              <TableHead className="text-xs">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {noiseRows.map(({ noise, r }) => (
              <TableRow key={noise} className={noise === cfg.noisePct ? "bg-secondary/60" : undefined}>
                <TableCell className="mono-num text-xs font-semibold">{noise}%</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.unc.pbar)}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.unc.U, 5)}</TableCell>
                <TableCell className="mono-num text-xs">
                  {r.physics.available ? fmt(r.physics.Rphy) : "unavailable"}
                </TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.rel.Srel)}</TableCell>
                <TableCell>
                  <DecisionBadge decision={r.rel.decision} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Single-channel ablation"
        subtitle="Each row removes exactly one PMU channel and re-runs the whole pipeline."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Removed channel</TableHead>
              <TableHead className="text-xs">Remaining C</TableHead>
              <TableHead className="text-xs">p̄</TableHead>
              <TableHead className="text-xs">U</TableHead>
              <TableHead className="text-xs">Physics term</TableHead>
              <TableHead className="text-xs">S_rel</TableHead>
              <TableHead className="text-xs">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ablation.map(({ removed, r }) => (
              <TableRow key={removed}>
                <TableCell className="mono-num text-xs font-semibold">{removed}</TableCell>
                <TableCell className="mono-num text-xs">{r.seq.channels.length}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.unc.pbar)}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.unc.U, 5)}</TableCell>
                <TableCell className="text-xs">
                  {r.physics.available ? `${r.physics.band} (R = ${fmt(r.physics.Rphy)})` : "omitted — θ or f missing"}
                </TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.rel.Srel)}</TableCell>
                <TableCell>
                  <DecisionBadge decision={r.rel.decision} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          Removing the voltage phase angle or the frequency channel disables the physics-consistency term entirely. The
          pipeline then reports an uncertainty-only reliability score and states the limitation instead of imputing a
          residual value.
        </p>
      </SectionCard>

      <DemoNotice>
        These sweeps are mechanism demonstrations on a single illustrative record with an untrained encoder. They show how
        the reliability score responds to degraded inputs; they are not a robustness evaluation, which would require a
        trained model and a labelled test set across many events and operating points.
      </DemoNotice>
    </>
  );
}