import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { AdvancedSettings } from "@/components/pmu/controls";
import { Formula, MetricCard, ModelStatusNotice, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";

export const Route = createFileRoute("/uncertainty")({
  head: () => ({
    meta: [
      { title: "Evidential Uncertainty — PMU Stability Analysis" },
      {
        name: "description",
        content:
          "The CfC evidential head returns class evidence, Dirichlet probabilities and total evidential uncertainty for the reliability score.",
      },
      { property: "og:title", content: "Evidential Uncertainty — PMU Stability Analysis" },
      {
        property: "og:description",
        content: "Class evidence, probability, and how evidential uncertainty feeds the physics-calibrated reliability score.",
      },
    ],
  }),
  component: UncertaintyPage,
});

function UncertaintyPage() {
  const { result } = usePmu();
  const { pbar, U } = result.unc;
  const level = !result.modelOutputAvailable ? "unavailable" : U > 0.5 ? "high" : U > 0.25 ? "moderate" : "low";

  return (
    <>
      <PageHeader
        eyebrow="Uncertainty quantification"
        title="Evidential Learning Uncertainty"
        description="The CfC evidential head returns non-negative class evidence. Dirichlet strength determines both Stable/Unstable probabilities and the total evidential uncertainty U_evi."
      />
      <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="P(Stable)" value={fmt(result.modelOutputAvailable ? 1 - pbar : null)} hint="α_stable / Σα" />
        <MetricCard
          label="P(Unstable)"
          value={fmt(result.modelOutputAvailable ? pbar : null)}
          hint="α_unstable / Σα"
        />
        <MetricCard
          label="Evidential uncertainty U_evi"
          value={fmt(result.modelOutputAvailable ? U : null, 5)}
          hint={`${level} uncertainty`}
          tone={level === "high" ? "uncertain" : "neutral"}
        />
        <MetricCard label="Model status" value={result.modelStatus} hint="probabilities require labelled training" />
      </div>

      <SectionCard title="Evidential estimator" subtitle="A two-class Dirichlet distribution is formed directly from the CfC output head.">
        <div className="space-y-3">
          <Formula label="The softplus head guarantees non-negative evidence.">
            e_k ≥ 0,&nbsp;&nbsp;α_k = e_k + 1
          </Formula>
          <Formula label="Class probability and total uncertainty for K=2 classes.">
            p_k = α_k / Σ_j α_j,&nbsp;&nbsp;U_evi = 2 / Σ_j α_j
          </Formula>
          <p className="text-sm text-muted-foreground">
            Low total evidence produces U_evi near one. Strong accumulated evidence increases Σα and lowers U_evi.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Effect on the decision" subtitle="Evidential uncertainty enters the reliability score directly.">
        <div className="space-y-3">
          <Formula label="The uncertainty penalty is calibrated on validation data.">
            exp(−α_rel·U_evi) = exp(−α_rel·{fmt(result.modelOutputAvailable ? U : null, 4)})
          </Formula>
          <p className="text-sm text-muted-foreground">
            When calibration is unavailable, the backend withholds S_rel and returns Uncertain instead of applying frontend placeholder constants.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Display and nominal-system settings" subtitle="Nominal frequency remains configurable; trained calibration values come from the backend artifact.">
        <AdvancedSettings />
      </SectionCard>
    </>
  );
}
