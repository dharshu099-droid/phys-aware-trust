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

  const physics = physicsResidual(seq, {
    dt: noisy.event.dt,
    f0: cfg.nominalFrequency,
    angleUnit: noisy.event.angleUnit,
    bands: PHYSICS_BANDS,
  });

  if (pre.event.modelPrediction) {
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const frequencies = noisy.event.channels.f ?? [];
    const voltages = noisy.event.channels.V ?? [];
    const maxFrequencyDeviation = frequencies.reduce((max, value) => Math.max(max, Math.abs(value - cfg.nominalFrequency)), 0);
    let maxRocof = 0;
    for (let i = 1; i < frequencies.length; i++) maxRocof = Math.max(maxRocof, Math.abs((frequencies[i]! - frequencies[i - 1]!) / noisy.event.dt));
    const voltageBaseline = voltages.slice(0, Math.max(5, Math.round(voltages.length * 0.1))).reduce((a, b) => a + b, 0) / Math.max(5, Math.round(voltages.length * 0.1));
    const maxVoltageDeviation = voltages.reduce((max, value) => Math.max(max, Math.abs(value / (voltageBaseline || 1) - 1)), 0);
    const frequencySeverity = clamp01((maxFrequencyDeviation - 0.05) / 0.15);
    const rocofSeverity = clamp01((maxRocof - 0.1) / 0.5);
    const voltageSeverity = clamp01((maxVoltageDeviation - 0.03) / 0.17);
    const physicsSeverity = physics.available ? clamp01(physics.Rphy / PHYSICS_BANDS[1]) : 0.5;
    const risk = clamp01(0.6 * frequencySeverity + 0.2 * rocofSeverity + 0.1 * voltageSeverity + 0.1 * physicsSeverity);
    unc.pbar = 0.05 + 0.9 * risk;
    const forecastSigma = (pre.event.modelPrediction.upper90Hz - pre.event.modelPrediction.lower90Hz) / 3.29;
    const qualityPenalty = (physics.available ? physicsSeverity : 0.5) * 0.0025;
    unc.U = forecastSigma ** 2 + qualityPenalty ** 2;
    unc.std = Math.sqrt(unc.U);
    const rand = mulberry32(cfg.seed + 991);
    unc.samples = Array.from({ length: cfg.K }, () => clamp01(unc.pbar + (rand() + rand() + rand() - 1.5) * unc.std * 12));
  }

  const rel = reliability(unc.pbar, unc.U, physics.available ? physics.Rphy : null, cfg);
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
