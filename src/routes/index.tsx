import { createFileRoute, Link } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { FlowDiagram } from "@/components/pmu/flow";
import { ReliabilityExplanation } from "@/components/pmu/explanation";
import { DecisionBanner, DemoNotice, fmt, MetricCard, ModelStatusNotice, PageHeader, SectionCard } from "@/components/pmu/ui";
import { EventSelector, WindowSelector } from "@/components/pmu/controls";
import { ProbabilityGauge } from "@/components/pmu/charts";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Physics-Calibrated Evidential CfC" },
      {
        name: "description",
        content:
          "End-to-end PMU pipeline: CfC temporal inference, evidential uncertainty, PMU physics consistency and a calibrated reliability decision.",
      },
      { property: "og:title", content: "Overview — Physics-Calibrated Evidential CfC" },
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
        title="Physics-Calibrated Evidential CfC for Reliable Early Transient Stability Assessment"
        description="A Python CfC model and evidential head produce class probabilities and uncertainty only when valid labelled training exists. Independent PMU physics consistency and calibrated reliability determine whether the output is Stable, Unstable or Uncertain."
      />
      <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />

      <DemoNotice>
        <strong>Illustrative software demo.</strong> The selected record is “{event.name}”.{" "}
        {event.origin === "demo"
          ? "Built-in waveforms are synthetic Illustrative Demo PMU Events generated in the browser — they are not Transmission Signature Library (TSL) records and not field measurements."
          : "This is an uploaded CSV; the application does not verify its provenance."}{" "}
        {event.origin === "demo" ? " Values for built-in records are illustrative only." : " Backend model status and measured physics outputs are reported without creating missing labels or probabilities."}
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
        <SectionCard title="Instability probability gauge" subtitle="P(Unstable) from the evidential CfC head.">
          {result.modelOutputAvailable ? <ProbabilityGauge p={unc.pbar} /> : <p className="py-16 text-center text-4xl font-semibold text-muted-foreground">N/A</p>}
          <p className="mt-1 text-center text-xs text-muted-foreground">
            near 0 → more stable · near 1 → more unstable · near 0.5 → ambiguous
          </p>
        </SectionCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Instability probability"
          value={fmt(result.modelOutputAvailable ? unc.pbar : null)}
          hint="P(Unstable) = α_unstable / Σα."
          tone={unc.pbar >= cfg.tauU ? "unstable" : unc.pbar <= cfg.tauS ? "stable" : "uncertain"}
        />
        <MetricCard
          label="Evidential uncertainty"
          value={fmt(result.modelOutputAvailable ? unc.U : null, 5)}
          hint="U_evi = 2 / Σα from the evidential head."
          footer={`model ${result.modelStatus}`}
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
          hint="S_rel = C·exp(−α_rel·U_evi − β_rel·R̃_phy)."
          footer="parameters from backend calibration"
        />
        <MetricCard
          label="Final decision"
          value={rel.decision}
          tone={rel.decision === "Stable" ? "stable" : rel.decision === "Unstable" ? "unstable" : "uncertain"}
          footer={result.source === "backend" ? "Python backend output" : "illustrative browser output"}
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
