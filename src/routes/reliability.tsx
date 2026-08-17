import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { AdvancedSettings } from "@/components/pmu/controls";
import { ReliabilityExplanation } from "@/components/pmu/explanation";
import { DecisionBanner, DemoNotice, Formula, MetricCard, ModelStatusNotice, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
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
  const { result, cfg, event } = usePmu();
  const { C, Utilde, Rtilde, Srel, decision } = result.rel;
  const pbar = result.unc.pbar;
  const backend = event.backendAnalysis?.windows[String(cfg.windowMs)];
  const calibration = backend?.calibration;
  const alpha = calibration?.alpha_rel ?? cfg.alpha;
  const beta = calibration?.beta_rel ?? cfg.beta;
  const tauStable = calibration?.tau_stable ?? cfg.tauS;
  const tauUnstable = calibration?.tau_unstable ?? cfg.tauU;
  const tauReliability = calibration?.tau_reliability ?? cfg.tauR;
  const penalty = alpha * Utilde + beta * (Rtilde ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Reliability assessment"
        title="Physics-Calibrated Reliability Score and Final Decision"
        description="The reliability score is the core contribution of the method: a decisive probability only survives if the prediction is also stable under dropout sampling and the underlying PMU measurements are physically self-consistent. Anything else is reported as Uncertain and escalated to the operator."
      />
      <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />

      <DecisionBanner
        decision={decision}
        message={result.modelOutputAvailable ? `Instability probability = ${fmt(pbar)} with reliability score S_rel = ${fmt(Srel)} against τ_R = ${tauReliability}.${
          result.physics.available
            ? ""
            : " Physics-consistency term omitted: the required PMU channels are unavailable for this observation."
        }` : "A Stable/Unstable probability and reliability score are unavailable. The backend therefore abstains and reports Uncertain."}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Confidence margin C" value={fmt(C)} hint="2·|p̄ − 0.5|" />
        <MetricCard label="Evidential uncertainty U_evi" value={fmt(Utilde, 4)} hint="from Dirichlet strength" />
        <MetricCard
          label="Normalised physics residual R̃"
          value={Rtilde === null ? "unavailable" : fmt(Rtilde, 4)}
          hint={`R₀ = ${fmt(calibration?.R0)}`}
        />
        <MetricCard
          label="Reliability score S_rel"
          value={fmt(Srel)}
          tone={Srel >= tauReliability ? "stable" : "uncertain"}
          hint={`threshold τ_R = ${fmt(calibration?.tau_reliability)}`}
        />
      </div>

      <SectionCard title="Reliability algorithm" subtitle="Each term is computed from the current observation window.">
        <div className="space-y-3">
          <Formula label="Step 1 — confidence margin: how far the mean probability sits from the indecisive point 0.5.">
            C = 2 · |p̄ − 0.5| = 2 · |{fmt(pbar)} − 0.5| = {fmt(C)}
          </Formula>
          <Formula label="Step 2 — bounded normalisation of the two penalty terms.">
            U_evi = 2 / Σ_k α_k = {fmt(Utilde, 4)}
            {Rtilde === null ? "  ·  R̃ omitted (physics unavailable)" : `  ·  R̃ = R_phy / (R_phy + R₀) = ${fmt(Rtilde, 4)}`}
          </Formula>
          <Formula label="Step 3 — multiplicative penalty on the confidence margin.">
            S_rel = C · exp( −α_rel·U_evi − β_rel·R̃ ) = {fmt(C)} · exp( −{fmt(calibration?.alpha_rel)}·{fmt(Utilde, 3)} − {fmt(calibration?.beta_rel)}·
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
                  P_unstable ≤ τ_S ({fmt(tauStable)}) and S_rel ≥ τ_R ({fmt(tauReliability)})
                </TableCell>
                <TableCell className="text-xs font-semibold">Stable</TableCell>
                <TableCell className="text-xs">{pbar <= tauStable && Srel >= tauReliability ? "yes" : "no"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="mono-num text-xs">
                  P_unstable ≥ τ_U ({fmt(tauUnstable)}) and S_rel ≥ τ_R ({fmt(tauReliability)})
                </TableCell>
                <TableCell className="text-xs font-semibold">Unstable</TableCell>
                <TableCell className="text-xs">{pbar >= tauUnstable && Srel >= tauReliability ? "yes" : "no"}</TableCell>
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

      {event.origin === "demo" ? <SectionCard title="Illustrative settings" subtitle="These controls apply only to the browser demonstration."><AdvancedSettings /></SectionCard> : null}

      <DemoNotice>
        For uploaded records, R₀, α_rel, β_rel and all decision thresholds are accepted only from the Python backend's
        validation calibration artifact. When that artifact is absent, the application reports Uncertain and displays no invented values.
      </DemoNotice>
    </>
  );
}
