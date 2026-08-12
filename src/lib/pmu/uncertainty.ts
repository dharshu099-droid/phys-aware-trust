export interface UncertaintyResult {
  samples: number[];
  pbar: number;
  U: number;
  std: number;
  K: number;
}

/** MC Dropout: pbar = (1/K) sum p_k, U = (1/K) sum (p_k - pbar)^2 */
export function aggregate(samples: number[]): UncertaintyResult {
  const K = samples.length;
  const pbar = samples.reduce((a, b) => a + b, 0) / K;
  const U = samples.reduce((a, b) => a + (b - pbar) ** 2, 0) / K;
  return { samples, pbar, U, std: Math.sqrt(U), K };
}

export function histogram(samples: number[], bins = 12) {
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  const span = hi - lo || 1e-6;
  const counts = new Array<number>(bins).fill(0);
  for (const s of samples) {
    const idx = Math.min(bins - 1, Math.floor(((s - lo) / span) * bins));
    counts[idx] = counts[idx]! + 1;
  }
  return counts.map((c, i) => ({ bin: (lo + ((i + 0.5) * span) / bins).toFixed(3), count: c }));
}