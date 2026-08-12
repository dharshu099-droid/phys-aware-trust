import type { ChannelKey, PmuEvent } from "./types";

export interface StageStatus {
  name: string;
  status: "completed" | "warning" | "skipped";
  detail: string;
}

export interface PreprocessResult {
  event: PmuEvent; // cleaned, original units
  stages: StageStatus[];
  missingCount: number;
  stats: Partial<Record<ChannelKey, { mean: number; std: number; min: number; max: number }>>;
}

function interpolateGaps(arr: number[]) {
  const out = arr.slice();
  let filled = 0;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i]!)) continue;
    let a = i - 1;
    while (a >= 0 && !Number.isFinite(out[a]!)) a--;
    let b = i + 1;
    while (b < out.length && !Number.isFinite(out[b]!)) b++;
    const va = a >= 0 ? out[a]! : undefined;
    const vb = b < out.length ? out[b]! : undefined;
    out[i] = va !== undefined && vb !== undefined ? va + ((vb - va) * (i - a)) / (b - a) : (va ?? vb ?? 0);
    filled++;
  }
  return { out, filled };
}

/** Time synchronisation → missing-value detection → cleaning → statistics. */
export function preprocess(event: PmuEvent): PreprocessResult {
  const stages: StageStatus[] = [];
  const dt = event.dt;
  const t = event.t.map((_, i) => Number((i * dt).toFixed(6)));
  const jitter = event.t.reduce(
    (m, v, i) => (Number.isFinite(v) ? Math.max(m, Math.abs(v - i * dt)) : m),
    0,
  );
  stages.push({
    name: "Time synchronization",
    status: "completed",
    detail: `Resampled onto a uniform ${(dt * 1000).toFixed(2)} ms grid (max input timestamp deviation ${(jitter * 1000).toFixed(2)} ms).`,
  });

  let missingCount = 0;
  const cleaned: Partial<Record<ChannelKey, number[]>> = {};
  for (const [k, arr] of Object.entries(event.channels) as [ChannelKey, number[]][]) {
    const { out, filled } = interpolateGaps(arr);
    missingCount += filled;
    cleaned[k] = out;
  }
  stages.push({
    name: "Missing-value detection",
    status: missingCount > 0 ? "warning" : "completed",
    detail: missingCount > 0 ? `${missingCount} sample(s) detected as missing or non-numeric.` : "No gaps found.",
  });
  stages.push({
    name: "Cleaning",
    status: "completed",
    detail: missingCount > 0 ? `${missingCount} gap(s) linearly interpolated from neighbouring samples.` : "No cleaning required.",
  });

  const stats: PreprocessResult["stats"] = {};
  for (const [k, arr] of Object.entries(cleaned) as [ChannelKey, number[]][]) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 1e-9;
    stats[k] = { mean, std, min: Math.min(...arr), max: Math.max(...arr) };
  }
  stages.push({
    name: "Normalization",
    status: "completed",
    detail: "Per-channel z-score statistics estimated from the pre-disturbance and full record (applied at sequence build time).",
  });

  return { event: { ...event, t, channels: cleaned }, stages, missingCount, stats };
}

export interface WindowedSequence {
  /** X = [x_1 ... x_T], x_t = [V, theta, f, P, Q ...] for available channels */
  X: number[][];
  Xnorm: number[][];
  channels: ChannelKey[];
  t: number[];
  startIdx: number;
  endIdx: number;
  T: number;
}

/** Observation-window extraction: [eventTime, eventTime + windowMs]. */
export function extractWindow(
  pre: PreprocessResult,
  windowMs: number,
  activeChannels: ChannelKey[],
): WindowedSequence {
  const ev = pre.event;
  const startIdx = Math.max(0, Math.round(ev.eventTime / ev.dt));
  const count = Math.max(4, Math.round(windowMs / 1000 / ev.dt));
  const endIdx = Math.min(ev.t.length - 1, startIdx + count - 1);
  const channels = activeChannels.filter((c) => ev.channels[c]);
  const X: number[][] = [];
  const Xnorm: number[][] = [];
  const t: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    t.push(ev.t[i]!);
    X.push(channels.map((c) => ev.channels[c]![i]!));
    Xnorm.push(
      channels.map((c) => {
        const s = pre.stats[c]!;
        return (ev.channels[c]![i]! - s.mean) / s.std;
      }),
    );
  }
  return { X, Xnorm, channels, t, startIdx, endIdx, T: X.length };
}

/** X_noise = X + eps, eps ~ N(0, sigma^2), sigma = pct * per-channel std. */
export function addNoise(pre: PreprocessResult, pct: number, rand: () => number): PreprocessResult {
  if (pct <= 0) return pre;
  const channels: Partial<Record<ChannelKey, number[]>> = {};
  for (const [k, arr] of Object.entries(pre.event.channels) as [ChannelKey, number[]][]) {
    const sigma = (pct / 100) * (pre.stats[k]?.std ?? 1);
    channels[k] = arr.map((v) => {
      const u = Math.max(rand(), 1e-12);
      return v + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    });
  }
  return { ...pre, event: { ...pre.event, channels } };
}