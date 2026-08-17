import { usePmu } from "@/lib/pmu/store";
import { fmt, SectionCard } from "./ui";

export function reliabilityNarrative(args: {
  pbar: number;
  U: number;
  physicsAvailable: boolean;
  band: string;
  Srel: number;
  tauR: number;
  decision: string;
  tauS: number;
  tauU: number;
}) {
  const { pbar, physicsAvailable, band, Srel, tauR, decision, tauS, tauU } = args;
  const direction = pbar >= tauU ? "instability" : pbar <= tauS ? "stable behaviour" : "an ambiguous class boundary";
  if (decision !== "Uncertain") {
    return `The encoder identified an early disturbance pattern associated with ${direction} (mean instability probability ${pbar.toFixed(
      2,
    )}). Evidential uncertainty was sufficiently low, and ${
      physicsAvailable
        ? `the measured phase-frequency behaviour showed ${band} physical deviation`
        : "no phase/frequency physics check was available, so no physical penalty was applied"
    }. The resulting reliability score ${Srel.toFixed(2)} therefore exceeded the configured threshold τr = ${tauR.toFixed(
      2,
    )}.`;
  }
  if (pbar > tauS && pbar < tauU) {
    return `The mean instability probability ${pbar.toFixed(
      2,
    )} lies between the configured thresholds τs = ${tauS.toFixed(2)} and τu = ${tauU.toFixed(
      2,
    )}, i.e. close to the decision boundary. The event is retained as uncertain rather than forcing a binary decision; continued observation or additional PMU measurements are required.`;
  }
  return `The classification probability was decisive (${pbar.toFixed(
    2,
  )}), but evidential uncertainty ${
    physicsAvailable ? `and/or ${band} phase-frequency inconsistency ` : ""
  }reduced the reliability score to ${Srel.toFixed(2)}, below τr = ${tauR.toFixed(
    2,
  )}. The event has therefore been retained as uncertain rather than accepted as a binary decision.`;
}

export function ReliabilityExplanation() {
  const { result, cfg } = usePmu();
  const { unc, physics, rel } = result;
  const uncLabel = !result.modelOutputAvailable ? "Unavailable" : unc.U <= 0.25 ? "Low" : unc.U <= 0.5 ? "Moderate" : "High";
  const relLabel = rel.Srel >= cfg.tauR ? (rel.Srel >= 0.75 ? "High" : "Sufficient") : "Insufficient";

  const rows = [
    { stage: "CfC", finding: `Instability probability = ${result.modelOutputAvailable ? `${(unc.pbar * 100).toFixed(0)}%` : "unavailable"}` },
    { stage: "Evidential", finding: `Evidential uncertainty = ${uncLabel} (U_evi = ${fmt(unc.U, 5)})` },
    {
      stage: "PMU Physics",
      finding: physics.available
        ? `Phase-frequency residual = ${physics.band} (R_phy = ${fmt(physics.Rphy)} rad/s)`
        : "Phase-frequency residual = unavailable (channel missing)",
    },
    { stage: "Reliability", finding: `Physics-calibrated reliability = ${relLabel} (S_rel = ${fmt(rel.Srel)})` },
    { stage: "Decision", finding: rel.decision },
  ];

  return (
    <SectionCard
      title="Reliability explanation"
      subtitle="Why the framework produced this decision for the current event, window and channel configuration."
    >
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.stage} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
            <span className="w-32 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {r.stage}
            </span>
            <span className="mono-num text-sm text-foreground">{r.finding}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-md bg-secondary/70 px-4 py-3 text-sm leading-relaxed text-foreground/85">
        {!result.modelOutputAvailable ? result.statusReason ?? "The backend withheld model probabilities because no valid trained and calibrated artifact is available." : reliabilityNarrative({
          pbar: unc.pbar,
          U: unc.U,
          physicsAvailable: physics.available,
          band: physics.band,
          Srel: rel.Srel,
          tauR: cfg.tauR,
          decision: rel.decision,
          tauS: cfg.tauS,
          tauU: cfg.tauU,
        })}
      </p>
    </SectionCard>
  );
}
