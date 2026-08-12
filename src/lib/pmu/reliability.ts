import type { PipelineConfig } from "./types";

export type Decision = "Stable" | "Unstable" | "Uncertain";

export interface ReliabilityResult {
  C: number;
  Utilde: number;
  Rtilde: number | null;
  Srel: number;
  decision: Decision;
  reasonKey: "reliable" | "low-reliability" | "ambiguous-probability";
}

/**
 * C = 2|pbar - 0.5|
 * Utilde = U / (U + U0);  Rtilde = R / (R + R0)   [U0, R0 chosen from validation data]
 * S_rel  = C * exp(-alpha*Utilde - beta*Rtilde)
 */
export function reliability(
  pbar: number,
  U: number,
  Rphy: number | null,
  cfg: PipelineConfig,
): ReliabilityResult {
  const C = 2 * Math.abs(pbar - 0.5);
  const Utilde = U / (U + cfg.U0);
  const Rtilde = Rphy === null || !Number.isFinite(Rphy) ? null : Rphy / (Rphy + cfg.R0);
  const penalty = cfg.alpha * Utilde + cfg.beta * (Rtilde ?? 0);
  const Srel = C * Math.exp(-penalty);

  let decision: Decision = "Uncertain";
  let reasonKey: ReliabilityResult["reasonKey"] = "ambiguous-probability";
  const reliable = Srel >= cfg.tauR;
  if (pbar <= cfg.tauS && reliable) {
    decision = "Stable";
    reasonKey = "reliable";
  } else if (pbar >= cfg.tauU && reliable) {
    decision = "Unstable";
    reasonKey = "reliable";
  } else if ((pbar <= cfg.tauS || pbar >= cfg.tauU) && !reliable) {
    reasonKey = "low-reliability";
  }
  return { C, Utilde, Rtilde, Srel, decision, reasonKey };
}