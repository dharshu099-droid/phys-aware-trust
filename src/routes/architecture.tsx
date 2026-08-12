import { createFileRoute } from "@tanstack/react-router";
import { FlowDiagram } from "@/components/pmu/flow";
import { DemoNotice, KeyValue, PageHeader, SectionCard } from "@/components/pmu/ui";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System Architecture — PMU to Reliable Decision" },
      {
        name: "description",
        content:
          "End-to-end architecture: PMU input, preprocessing, early observation window, Transformer encoder, MC dropout, physics consistency, reliability score and final decision.",
      },
      { property: "og:title", content: "System Architecture" },
      {
        property: "og:description",
        content: "Interactive block diagram of the physics-calibrated uncertainty-aware stability assessment pipeline.",
      },
    ],
  }),
  component: ArchitecturePage,
});

function ArchitecturePage() {
  return (
    <>
      <PageHeader
        eyebrow="Architecture"
        title="From PMU Measurements to a Reliable Stability Decision"
        description="Select any block to see what it consumes, what it produces and what it can refuse to answer. The two branches after the encoder — stochastic uncertainty and PMU physics consistency — are combined only at the reliability stage, so neither can be silently dominated by a confident-looking probability."
      />

      <SectionCard title="Pipeline" subtitle="Click a block for its contract and current output.">
        <FlowDiagram />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Design rationale">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Early window, not full transient.</strong> The encoder sees only the
              first few hundred milliseconds after the disturbance so a decision is available while remedial action is
              still useful.
            </li>
            <li>
              <strong className="text-foreground">Attention over recurrence.</strong> Self-attention relates any two
              samples in the window directly, which suits multivariate synchrophasor sequences with short, sharp events.
            </li>
            <li>
              <strong className="text-foreground">Uncertainty before action.</strong> MC dropout turns a point probability
              into a distribution, so instability of the prediction itself becomes visible.
            </li>
            <li>
              <strong className="text-foreground">Physics as a calibrator.</strong> The phase-frequency residual audits
              the input rather than the model, catching bad data that a purely statistical confidence measure cannot see.
            </li>
            <li>
              <strong className="text-foreground">Abstention as an output.</strong> Stable / Unstable / Uncertain, with the
              third class carrying an explanation the operator can act on.
            </li>
          </ul>
        </SectionCard>

        <SectionCard title="Implementation map" subtitle="Reference research stack and this deployment.">
          <KeyValue
            items={[
              { k: "Reference backend", v: "FastAPI + PyTorch (nn.TransformerEncoder), NumPy, Pandas" },
              { k: "This deployment", v: "TanStack Start + React + TypeScript, in-browser reimplementation" },
              { k: "Data loading", v: "src/lib/pmu/dataLoader.ts — demo events and CSV ingest" },
              { k: "Preprocessing", v: "src/lib/pmu/preprocessing.ts — sync, cleaning, resampling, z-score, windowing" },
              { k: "Model", v: "src/lib/pmu/transformerModel.ts — projection, positional encoding, attention, head" },
              { k: "Uncertainty", v: "src/lib/pmu/uncertainty.ts — MC dropout aggregation" },
              { k: "Physics", v: "src/lib/pmu/physics.ts — dθ/dt vs 2π(f − f₀) residual" },
              { k: "Reliability", v: "src/lib/pmu/reliability.ts — S_rel and the decision rule" },
              { k: "Orchestration", v: "src/lib/pmu/inference.ts — single pass and window sweeps" },
              { k: "Charts", v: "Recharts" },
            ]}
          />
        </SectionCard>
      </div>

      <DemoNotice>
        The architecture is faithful to the method, but this environment provides no Python runtime and no trained
        checkpoint. Every stage therefore runs as a deterministic in-browser reimplementation over illustrative demo
        events or user-supplied CSV data, and the outputs are mechanism demonstrations rather than experimental results.
      </DemoNotice>
    </>
  );
}