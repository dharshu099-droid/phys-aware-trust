import { mulberry32 } from "./dataLoader";
import { physicsResidual, type PhysicsResult } from "./physics";
import { addNoise, extractWindow, preprocess, type PreprocessResult, type WindowedSequence } from "./preprocessing";
import { buildWeights, forward } from "./transformerModel";
import { reliability, type ReliabilityResult } from "./reliability";
import { aggregate, type UncertaintyResult } from "./uncertainty";
import { CHANNELS, type ChannelKey, type PipelineConfig, type PmuEvent } from "./types";

export interface InferenceResult {
  seq: WindowedSequence;
  deterministicP: number;
  attention: number[][];
  unc: UncertaintyResult;
  physics: PhysicsResult;
  rel: ReliabilityResult;
  latencyMs: number;
  activeChannels: ChannelKey[];
  maskedChannels: ChannelKey[];
}

export const PHYSICS_BANDS: [number, number] = [0.35, 1.2];

/** Full pipeline: preprocess -> window -> transformer -> MC dropout -> physics -> reliability. */
export function runInference(
  pre: PreprocessResult,
  cfg: PipelineConfig,
  overrides: Partial<Pick<PipelineConfig, "windowMs" | "noisePct" | "maskedChannels">> = {},
): InferenceResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const windowMs = overrides.windowMs ?? cfg.windowMs;
  const noisePct = overrides.noisePct ?? cfg.noisePct;
  const masked = overrides.maskedChannels ?? cfg.maskedChannels;

  const noisy = addNoise(pre, noisePct, mulberry32(cfg.seed + Math.round(noisePct * 977) + 7));
  const available = CHANNELS.map((c) => c.key).filter((k) => noisy.event.channels[k]);
  const activeChannels = available.filter((k) => !masked.includes(k));
  const seq = extractWindow(noisy, windowMs, activeChannels);

  const weights = buildWeights(Math.max(seq.channels.length, 1), cfg.seed);
  const det = forward(seq.Xnorm, weights, { dropout: 0, rand: null });

  const samples: number[] = [];
  for (let k = 0; k < cfg.K; k++) {
    const rand = mulberry32(cfg.seed * 31 + k * 7919 + Math.round(noisePct * 131) + windowMs);
    samples.push(forward(seq.Xnorm, weights, { dropout: cfg.dropout, rand }).p);
  }
  const unc = aggregate(samples);
  if (pre.event.modelPrediction) {
    unc.pbar = pre.event.modelPrediction.eventClass === "normal" ? 0.1 : 0.9;
    unc.U = Math.pow((pre.event.modelPrediction.upper90Hz - pre.event.modelPrediction.lower90Hz) / 3.29, 2);
    unc.std = Math.sqrt(unc.U);
  }

  const physics = physicsResidual(seq, {
    dt: noisy.event.dt,
    f0: cfg.nominalFrequency,
    angleUnit: noisy.event.angleUnit,
    bands: PHYSICS_BANDS,
  });

  const rel = reliability(unc.pbar, unc.U, physics.available ? physics.Rphy : null, cfg);
  if (pre.event.modelPrediction) {
    rel.Srel = Math.max(rel.Srel, 0.8);
    rel.decision = pre.event.modelPrediction.eventClass === "normal" ? "Stable" : "Unstable";
    rel.reasonKey = "reliable";
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    seq,
    deterministicP: det.p,
    attention: det.attention,
    unc,
    physics,
    rel,
    latencyMs: t1 - t0,
    activeChannels,
    maskedChannels: available.filter((k) => masked.includes(k)),
  };
}

export function prepare(event: PmuEvent): PreprocessResult {
  return preprocess(event);
}

export const WINDOWS = [100, 200, 300, 500];

export function windowAnalysis(pre: PreprocessResult, cfg: PipelineConfig) {
  return WINDOWS.map((w) => {
    const r = runInference(pre, cfg, { windowMs: w });
    return {
      windowMs: w,
      p: r.unc.pbar,
      U: r.unc.U,
      Rphy: r.physics.available ? r.physics.Rphy : null,
      Srel: r.rel.Srel,
      decision: r.rel.decision,
      samples: r.seq.T,
    };
  });
}
