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
          "End-to-end architecture: PMU input, preprocessing, early observation window, evidential CfC, physics consistency, reliability score and final decision.",
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
        description="The Python backend detects the PMU schema, preprocesses each event, applies an evidential CfC when a trained artifact exists, calculates physics consistency independently, and abstains whenever probabilities or calibrated reliability are unavailable."
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
              <strong className="text-foreground">Continuous-time temporal model.</strong> CfC dynamics represent the
              evolving multivariate PMU response while retaining the event sampling interval.
            </li>
            <li>
              <strong className="text-foreground">Evidence before action.</strong> The Dirichlet head produces class
              evidence, probabilities and U_evi together, so weak total evidence is explicit.
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
              { k: "Backend", v: "FastAPI + PyTorch + ncps CfC + Pandas/NumPy/scikit-learn" },
              { k: "Frontend", v: "Existing TanStack Start + React interface" },
              { k: "Data inspection", v: "pmu_backend/preprocessing.py — schema, locations, phases, sampling" },
              { k: "Preprocessing", v: "timestamps, missing values, radians, unwrap, normalization, windows" },
              { k: "Model", v: "pmu_backend/model.py — CfC + two-class evidential head" },
              { k: "Training/calibration", v: "pmu_backend/service.py — labelled events only" },
              { k: "Physics", v: "independent dθ/dt − 2π(f−f₀) residual" },
              { k: "API", v: "inspection, physics, train, calibrate, predict, evaluate, stream emulator" },
              { k: "Charts", v: "Recharts" },
            ]}
          />
        </SectionCard>
      </div>

      <DemoNotice>
        The backend never derives stability labels from filenames. Without explicit labelled events and a calibrated
        artifact, it remains UNTRAINED and returns no class probability, accuracy or reliability value.
      </DemoNotice>
    </>
  );
}
