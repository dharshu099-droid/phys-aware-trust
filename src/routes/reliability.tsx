import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { AdvancedSettings } from "@/components/pmu/controls";
import { ReliabilityExplanation } from "@/components/pmu/explanation";
import { DecisionBanner, DemoNotice, Formula, MetricCard, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/reliability")({
  head: () => ({
    meta: [
      { title: "Physics-Calibrated Reliability & Final Decision" },
      {
        name: "description",
        content:
          "Combine confidence margin, predictive uncertainty and PMU physics consistency into a single reliability score, then map it to Stable, Unstable or Uncertain.",
      },
      { property: "og:title", content: "Physics-Calibrated Reliability" },
      {
        property: "og:description",
        content: "Step-by-step reliability computation and the abstain-aware decision rule behind the final output.",
      },
    ],
  }),
  component: ReliabilityPage,
});

function ReliabilityPage() {
  const { result, cfg } = usePmu();
  const { C, Utilde, Rtilde, Srel, decision } = result.rel;
  const pbar = result.unc.pbar;
  const penalty = cfg.alpha * Utilde + cfg.beta * (Rtilde ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Reliability assessment"
        title="Physics-Calibrated Reliability Score and Final Decision"
        description="The reliability score is the core contribution of the method: a decisive probability only survives if the prediction is also stable under dropout sampling and the underlying PMU measurements are physically self-consistent. Anything else is reported as Uncertain and escalated to the operator."
      />

      <DecisionBanner
        decision={decision}
        message={`Mean instability probability p̄ = ${fmt(pbar)} with reliability score S_rel = ${fmt(Srel)} against τ_R = ${cfg.tauR}.${
          result.physics.available
            ? ""
            : " Physics-consistency term omitted: the required PMU channels are unavailable for this observation."
        }`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Confidence margin C" value={fmt(C)} hint="2·|p̄ − 0.5|" />
        <MetricCard label="Normalised uncertainty Ũ" value={fmt(Utilde, 4)} hint={`U₀ = ${cfg.U0}`} />
        <MetricCard
          label="Normalised physics residual R̃"
          value={Rtilde === null ? "unavailable" : fmt(Rtilde, 4)}
          hint={`R₀ = ${cfg.R0}`}
        />
        <MetricCard
          label="Reliability score S_rel"
          value={fmt(Srel)}
          tone={Srel >= cfg.tauR ? "stable" : "uncertain"}
          hint={`threshold τ_R = ${cfg.tauR}`}
        />
      </div>

      <SectionCard title="Reliability algorithm" subtitle="Each term is computed from the current observation window.">
        <div className="space-y-3">
          <Formula label="Step 1 — confidence margin: how far the mean probability sits from the indecisive point 0.5.">
            C = 2 · |p̄ − 0.5| = 2 · |{fmt(pbar)} − 0.5| = {fmt(C)}
          </Formula>
          <Formula label="Step 2 — bounded normalisation of the two penalty terms.">
            Ũ = U / (U + U₀) = {fmt(Utilde, 4)}
            {Rtilde === null ? "  ·  R̃ omitted (physics unavailable)" : `  ·  R̃ = R_phy / (R_phy + R₀) = ${fmt(Rtilde, 4)}`}
          </Formula>
          <Formula label="Step 3 — multiplicative penalty on the confidence margin.">
            S_rel = C · exp( −α·Ũ − β·R̃ ) = {fmt(C)} · exp( −{cfg.alpha}·{fmt(Utilde, 3)} − {cfg.beta}·
            {Rtilde === null ? "0" : fmt(Rtilde, 3)} ) = {fmt(Srel)}
          </Formula>
          <p className="mono-num text-xs text-muted-foreground">
            total penalty exponent = {fmt(penalty, 4)} · attenuation factor exp(−penalty) = {fmt(Math.exp(-penalty), 4)}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Final decision rule" subtitle="Abstention is a first-class output, not an error state.">
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Condition</TableHead>
                <TableHead className="text-xs">Output</TableHead>
                <TableHead className="text-xs">Holds now?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="mono-num text-xs">
                  p̄ ≤ τ_S ({cfg.tauS}) and S_rel ≥ τ_R ({cfg.tauR})
                </TableCell>
                <TableCell className="text-xs font-semibold">Stable</TableCell>
                <TableCell className="text-xs">{pbar <= cfg.tauS && Srel >= cfg.tauR ? "yes" : "no"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="mono-num text-xs">
                  p̄ ≥ τ_U ({cfg.tauU}) and S_rel ≥ τ_R ({cfg.tauR})
                </TableCell>
                <TableCell className="text-xs font-semibold">Unstable</TableCell>
                <TableCell className="text-xs">{pbar >= cfg.tauU && Srel >= cfg.tauR ? "yes" : "no"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="mono-num text-xs">otherwise</TableCell>
                <TableCell className="text-xs font-semibold">Uncertain — escalate to operator</TableCell>
                <TableCell className="text-xs">{decision === "Uncertain" ? "yes" : "no"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            The rule is deliberately asymmetric in cost: an unreliable prediction is withheld rather than issued. In an
            operational setting an <em>Uncertain</em> output would trigger a longer observation window, an additional PMU
            view or a human dispatcher review, all of which are cheaper than a wrong stability call.
          </p>
        </div>
      </SectionCard>

      <ReliabilityExplanation />

      <SectionCard
        title="Threshold and calibration settings"
        subtitle="τ_S, τ_U, τ_R, α, β, U₀ and R₀ are configurable so their influence can be examined directly."
      >
        <AdvancedSettings />
      </SectionCard>

      <DemoNotice>
        All thresholds shown are prototype defaults. In a research study they must be selected on a validation split with
        the operating cost of a missed instability versus a false alarm made explicit; nothing on this page constitutes a
        validated operating point.
      </DemoNotice>
    </>
  );
}