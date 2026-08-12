import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { histogram } from "@/lib/pmu/uncertainty";
import { HistogramChart, RunsChart } from "@/components/pmu/charts";
import { AdvancedSettings } from "@/components/pmu/controls";
import { DemoNotice, Formula, MetricCard, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";

export const Route = createFileRoute("/uncertainty")({
  head: () => ({
    meta: [
      { title: "Predictive Uncertainty — MC Dropout Analysis" },
      {
        name: "description",
        content:
          "Monte-Carlo dropout over K stochastic forward passes gives the mean instability probability and its predictive variance, the first ingredient of the reliability score.",
      },
      { property: "og:title", content: "Predictive Uncertainty — MC Dropout" },
      {
        property: "og:description",
        content: "Per-run probabilities, their distribution, and how variance feeds the physics-calibrated reliability score.",
      },
    ],
  }),
  component: UncertaintyPage,
});

function UncertaintyPage() {
  const { result, cfg } = usePmu();
  const { samples, pbar, U, std, K } = result.unc;
  const spread: [number, number] = [Math.min(...samples), Math.max(...samples)];
  const level = U > cfg.U0 * 1.5 ? "high" : U > cfg.U0 * 0.5 ? "moderate" : "low";

  return (
    <>
      <PageHeader
        eyebrow="Uncertainty quantification"
        title="Monte-Carlo Dropout Predictive Variance"
        description="Dropout stays active at inference time, so each forward pass samples a different sub-network. The spread of the resulting probabilities is a practical proxy for epistemic uncertainty: a confident model returns tightly clustered probabilities, an out-of-distribution or under-determined input does not."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Mean probability p̄" value={fmt(pbar)} hint="Average over K stochastic passes" />
        <MetricCard
          label="Predictive variance U"
          value={fmt(U, 5)}
          hint={`${level} relative to U₀ = ${cfg.U0}`}
          tone={level === "high" ? "uncertain" : "neutral"}
        />
        <MetricCard label="Standard deviation" value={fmt(std, 4)} hint="√U, on the probability scale" />
        <MetricCard label="Sample range" value={`${fmt(spread[0])} – ${fmt(spread[1])}`} hint={`min / max over ${K} runs`} />
      </div>

      <SectionCard title="Estimator" subtitle="Dropout remains enabled during inference; K passes are drawn from the same weights.">
        <div className="space-y-3">
          <Formula label="Mean predictive probability over K stochastic forward passes.">
            p̄ = (1/K) Σ_{"{"}k=1{"}"}^K p_k,&nbsp;&nbsp;p_k = f_θ^{"{"}dropout{"}"}(X)
          </Formula>
          <Formula label="Predictive variance used as the uncertainty measure U.">
            U = (1/K) Σ_{"{"}k=1{"}"}^K (p_k − p̄)²
          </Formula>
          <p className="text-sm text-muted-foreground">
            The demonstration uses K = {K} passes with dropout rate {cfg.dropout}. Each pass is seeded deterministically so
            reloading the page reproduces exactly the same distribution — a convenience for inspection, not a claim that
            uncertainty is deterministic in general.
          </p>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Per-run probabilities" subtitle="Each dot is one stochastic forward pass; the dashed line is p̄.">
          <RunsChart samples={samples} mean={pbar} height={210} />
        </SectionCard>
        <SectionCard title="Distribution of p_k" subtitle="Histogram over the K sampled probabilities.">
          <HistogramChart data={histogram(samples, 12)} height={210} />
        </SectionCard>
      </div>

      <SectionCard title="Effect on the decision" subtitle="Uncertainty enters the reliability score through the normalised term Ũ.">
        <div className="space-y-3">
          <Formula label="Bounded normalisation keeps Ũ ∈ [0,1) with the scale U₀ set from validation data.">
            Ũ = U / (U + U₀) = {fmt(U, 5)} / ({fmt(U, 5)} + {cfg.U0}) = {fmt(result.rel.Utilde, 4)}
          </Formula>
          <p className="text-sm text-muted-foreground">
            With α = {cfg.alpha}, the uncertainty term alone multiplies the confidence margin by exp(−α·Ũ) ={" "}
            <span className="mono-num">{fmt(Math.exp(-cfg.alpha * result.rel.Utilde), 4)}</span>. High variance therefore
            cannot be hidden behind a decisive-looking probability: it directly suppresses the reliability score and pushes
            the output toward <em>Uncertain</em>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Advanced settings" subtitle="Change K, the dropout rate or the U₀ scale and watch the distribution respond.">
        <AdvancedSettings />
      </SectionCard>

      <DemoNotice>
        Because the encoder is untrained, the variance shown here reflects the sensitivity of a randomly initialised
        network to dropout masks. The estimator is the one described in the method; the numbers are illustrative and are
        not calibrated uncertainty from a trained model.
      </DemoNotice>
    </>
  );
}