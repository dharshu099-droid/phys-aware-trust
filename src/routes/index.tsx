import { createFileRoute, Link } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { FlowDiagram } from "@/components/pmu/flow";
import { ReliabilityExplanation } from "@/components/pmu/explanation";
import { DecisionBanner, DemoNotice, fmt, MetricCard, PageHeader, SectionCard } from "@/components/pmu/ui";
import { EventSelector, WindowSelector } from "@/components/pmu/controls";
import { ProbabilityGauge } from "@/components/pmu/charts";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Physics-Calibrated Uncertainty-Aware Transformer" },
      {
        name: "description",
        content:
          "End-to-end research demonstration: PMU measurements, Transformer inference, MC dropout uncertainty, PMU physics consistency and a physics-calibrated reliability decision.",
      },
      { property: "og:title", content: "Overview — Physics-Calibrated Uncertainty-Aware Transformer" },
      {
        property: "og:description",
        content: "Follow one PMU event from raw synchrophasor data to a Stable / Unstable / Uncertain decision.",
      },
    ],
  }),
  component: Overview,
});

const DECISION_MESSAGE = {
  Stable: "Reliable early stability assessment for the selected observation window.",
  Unstable: "Potential instability detected with sufficient reliability for operator attention.",
  Uncertain:
    "Prediction reliability is insufficient. Continue observation or request additional measurements before acting.",
} as const;

function Overview() {
  const { event, result, cfg } = usePmu();
  const { unc, physics, rel } = result;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Physics-Calibrated Uncertainty-Aware Transformer for Reliable Early Power-System Stability Assessment"
        description="A high AI probability is not automatically treated as trustworthy. This prototype calibrates an early Transformer prediction with both predictive uncertainty and PMU-derived physical consistency before a stability decision is accepted. Research demonstration for control-centre decision support only."
      />

      <DemoNotice>
        <strong>Illustrative software demo.</strong> The selected record is “{event.name}”.{" "}
        {event.origin === "demo"
          ? "Built-in waveforms are synthetic Illustrative Demo PMU Events generated in the browser — they are not Transmission Signature Library (TSL) records and not field measurements."
          : "This is an uploaded CSV; the application does not verify its provenance."}{" "}
        Model weights are deterministically initialised and <strong>not trained</strong> on labelled transient-stability
        data, so every number below is a transparent demo value — never an experimental result.
      </DemoNotice>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <SectionCard title="Event & observation window" subtitle="Change either to re-run the whole pipeline.">
          <div className="space-y-4">
            <EventSelector />
            <WindowSelector />
            <p className="text-xs text-muted-foreground">
              Only the selected early sequence (T = {result.seq.T} samples, channels{" "}
              <span className="mono-num">{result.seq.channels.join(", ") || "none"}</span>) is passed to the AI pipeline.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="text-xs">
                <Link to="/pmu-event-data">Inspect PMU data</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-xs">
                <Link to="/reliability">Reliability breakdown</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-xs">
                <Link to="/stress-testing">Stress test</Link>
              </Button>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Instability probability gauge" subtitle="p̄ = mean over K MC dropout passes.">
          <ProbabilityGauge p={unc.pbar} />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            near 0 → more stable · near 1 → more unstable · near 0.5 → ambiguous
          </p>
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Instability probability"
          value={fmt(unc.pbar)}
          hint="Mean instability probability p̄ over the K stochastic forward passes."
          tone={unc.pbar >= cfg.tauU ? "unstable" : unc.pbar <= cfg.tauS ? "stable" : "uncertain"}
        />
        <MetricCard
          label="Predictive uncertainty"
          value={fmt(unc.U, 5)}
          hint="U = (1/K) Σ (p_k − p̄)², the variance of the MC dropout predictions."
          footer={`K = ${unc.K} passes`}
        />
        <MetricCard
          label="Physics residual"
          value={physics.available ? fmt(physics.Rphy) : "n/a"}
          unit={physics.available ? "rad/s" : undefined}
          hint="RMS residual between the measured phase-angle rate and 2π(f − f₀)."
          footer={physics.available ? `${physics.band} physical deviation` : "θ or f channel missing"}
        />
        <MetricCard
          label="Reliability score"
          value={fmt(rel.Srel)}
          hint="S_rel = C·exp(−α·Ũ − β·R̃_phy), where C = 2|p̄ − 0.5|."
          footer={`τr = ${cfg.tauR.toFixed(2)}`}
        />
        <MetricCard
          label="Final decision"
          value={rel.decision}
          tone={rel.decision === "Stable" ? "stable" : rel.decision === "Unstable" ? "unstable" : "uncertain"}
          footer={`inference ${result.latencyMs.toFixed(1)} ms in-browser`}
        />
      </div>

      <DecisionBanner decision={rel.decision} message={DECISION_MESSAGE[rel.decision]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Main research flow" subtitle="Every stage below is implemented and inspectable.">
          <FlowDiagram compact />
        </SectionCard>
        <div className="space-y-4">
          <ReliabilityExplanation />
          <SectionCard
            title="Illustrative demo scenario"
            subtitle="Labelled demo values — transparently generated by the running prototype, not measured research results."
          >
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
              <li>
                Select <span className="mono-num">DEMO-EV-001</span> (fault on a weak tie-line observed from a PMU) and
                the 200 ms window. The pipeline reports p̄ = {fmt(unc.pbar, 2)}, U = {fmt(unc.U, 4)}, R̃_phy ={" "}
                {rel.Rtilde === null ? "n/a" : fmt(rel.Rtilde, 2)} and S_rel = {fmt(rel.Srel, 2)}.
              </li>
              <li>
                Add measurement noise on the <Link className="underline" to="/stress-testing">Stress Testing</Link> page,
                or mask the phase-angle channel.
              </li>
              <li>
                Re-run: uncertainty and/or physics residual typically increase, the reliability score falls below τr, and
                the output abstains as <strong>Uncertain</strong> instead of forcing a binary answer.
              </li>
            </ol>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
