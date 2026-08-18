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
  const { result, event, cfg } = usePmu();
  const reference = event.referencePrediction;
  const activeReference = reference?.window_predictions?.[String(cfg.windowMs)] ?? reference;
  const { pbar, U } = result.unc;
  const displayedUncertainty = activeReference ? 1 - activeReference.reliability_score : U;
  const level = activeReference || result.modelOutputAvailable ? displayedUncertainty > 0.5 ? "high" : displayedUncertainty > 0.25 ? "moderate" : "low" : "unavailable";

  return (
    <>
      <PageHeader
        eyebrow="Uncertainty quantification"
        title={activeReference ? "Calibrated Screening Confidence" : "Evidential Learning Uncertainty"}
        description={activeReference ? "The deployed screening model reports stable/unstable proxy probabilities and reliability for each observation window. Genuine evidential U_evi is shown only when a labelled Evidential-CfC artifact is available." : "The CfC evidential head returns non-negative class evidence. Dirichlet strength determines both Stable/Unstable probabilities and the total evidential uncertainty U_evi."}
      />
      {activeReference ? <div className="rounded-md border border-stable/50 bg-stable/10 px-5 py-4 text-sm"><strong>Model status: READY</strong> — calibrated PMU anomaly screening model, {cfg.windowMs} ms window.</div> : <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="P(Stable proxy)" value={fmt(activeReference ? activeReference.normal_probability : result.modelOutputAvailable ? 1 - pbar : null)} hint={activeReference ? "1 - P(anomaly)" : "α_stable / Σα"} />
        <MetricCard
          label="P(Unstable proxy)"
          value={fmt(activeReference ? activeReference.anomaly_probability : result.modelOutputAvailable ? pbar : null)}
          hint={activeReference ? "calibrated anomaly probability" : "α_unstable / Σα"}
        />
        <MetricCard
          label={activeReference ? "Screening uncertainty proxy" : "Evidential uncertainty U_evi"}
          value={fmt(activeReference ? displayedUncertainty : result.modelOutputAvailable ? U : null, 5)}
          hint={activeReference ? `1 - reliability (${level})` : `${level} uncertainty`}
          tone={level === "high" ? "uncertain" : "neutral"}
        />
        <MetricCard label="Model status" value={activeReference ? "READY" : result.modelStatus} hint={activeReference ? "calibrated anomaly screening" : "probabilities require labelled training"} />
      </div>

      {activeReference ? <SectionCard title="Screening uncertainty calculation" subtitle="This is the active public model calculation; it is not labelled as evidential uncertainty.">
        <div className="space-y-3">
          <Formula label="Reliability measures distance from the ambiguous probability 0.5.">R = 2 · |P_unstable − 0.5|</Formula>
          <Formula label="Displayed screening uncertainty is the complement of reliability.">U_screen = 1 − R = {fmt(displayedUncertainty, 4)}</Formula>
          <p className="text-sm text-muted-foreground">The current {cfg.windowMs} ms result is <strong>{activeReference.screening_result}</strong>. A probability near 0.5 produces low reliability and high screening uncertainty.</p>
        </div>
      </SectionCard> : <SectionCard title="Evidential estimator" subtitle="A two-class Dirichlet distribution is formed directly from the CfC output head.">
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
      </SectionCard>}

      {!activeReference ? <SectionCard title="Effect on the decision" subtitle="Evidential uncertainty enters the reliability score directly.">
        <div className="space-y-3">
          <Formula label="The uncertainty penalty is calibrated on validation data.">
            exp(−α_rel·U_evi) = exp(−α_rel·{fmt(result.modelOutputAvailable ? U : null, 4)})
          </Formula>
          <p className="text-sm text-muted-foreground">
            When calibration is unavailable, the backend withholds S_rel and returns Uncertain instead of applying frontend placeholder constants.
          </p>
        </div>
      </SectionCard> : null}

      <SectionCard title="Display and nominal-system settings" subtitle="Nominal frequency remains configurable; trained calibration values come from the backend artifact.">
        <AdvancedSettings />
      </SectionCard>
    </>
  );
}
