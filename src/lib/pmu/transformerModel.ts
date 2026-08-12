import { mulberry32 } from "./dataLoader";

/**
 * Prototype Transformer encoder for multivariate PMU sequences, implemented in
 * TypeScript so it runs entirely in the browser (mirrors the PyTorch reference
 * architecture described in the Method Details panel).
 *
 * IMPORTANT (research integrity): the weights are DETERMINISTICALLY INITIALISED,
 * not trained on labelled transient-stability data. The readout therefore uses a
 * documented heuristic calibration so the demo stays responsive to the input
 * waveform. No number produced here is an experimental result.
 */
export const ARCH = {
  dModel: 64,
  nHeads: 4,
  nLayers: 2,
  dFF: 128,
  dropout: 0.2,
  maxTokens: 32,
};

type Mat = number[][];

function randMat(rows: number, cols: number, rand: () => number, scale: number): Mat {
  const m: Mat = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      const u = Math.max(rand(), 1e-12);
      row.push(scale * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()));
    }
    m.push(row);
  }
  return m;
}

interface LayerW {
  Wq: Mat;
  Wk: Mat;
  Wv: Mat;
  Wo: Mat;
  W1: Mat;
  W2: Mat;
}

export interface ModelWeights {
  inputDim: number;
  proj: Mat;
  layers: LayerW[];
  head: number[];
  headBias: number;
}

const cache = new Map<string, ModelWeights>();

export function buildWeights(inputDim: number, seed: number): ModelWeights {
  const key = `${inputDim}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rand = mulberry32(seed);
  const d = ARCH.dModel;
  const s = 1 / Math.sqrt(d);
  const w: ModelWeights = {
    inputDim,
    proj: randMat(inputDim, d, rand, 1 / Math.sqrt(Math.max(inputDim, 1))),
    layers: Array.from({ length: ARCH.nLayers }, () => ({
      Wq: randMat(d, d, rand, s),
      Wk: randMat(d, d, rand, s),
      Wv: randMat(d, d, rand, s),
      Wo: randMat(d, d, rand, s),
      W1: randMat(d, ARCH.dFF, rand, s),
      W2: randMat(ARCH.dFF, d, rand, s),
    })),
    head: randMat(1, d, rand, s)[0]!,
    headBias: 0,
  };
  cache.set(key, w);
  return w;
}

function matmul(A: Mat, B: Mat): Mat {
  const n = A.length,
    k = B.length,
    m = B[0]!.length;
  const out: Mat = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(m).fill(0);
    for (let p = 0; p < k; p++) {
      const a = A[i]![p]!;
      if (a === 0) continue;
      const Bp = B[p]!;
      for (let j = 0; j < m; j++) row[j] = row[j]! + a * Bp[j]!;
    }
    out.push(row);
  }
  return out;
}

function layerNorm(A: Mat): Mat {
  return A.map((row) => {
    const mean = row.reduce((a, b) => a + b, 0) / row.length;
    const varr = row.reduce((a, b) => a + (b - mean) ** 2, 0) / row.length;
    const den = Math.sqrt(varr + 1e-5);
    return row.map((v) => (v - mean) / den);
  });
}

function softmaxRow(row: number[]): number[] {
  const mx = Math.max(...row);
  const ex = row.map((v) => Math.exp(v - mx));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

function dropoutMat(A: Mat, p: number, rand: (() => number) | null): Mat {
  if (!rand || p <= 0) return A;
  const scale = 1 / (1 - p);
  return A.map((row) => row.map((v) => (rand() < p ? 0 : v * scale)));
}

/** Sinusoidal positional encoding added to the projected sequence. */
function addPositional(A: Mat): Mat {
  const d = A[0]!.length;
  return A.map((row, pos) =>
    row.map((v, i) => {
      const div = Math.pow(10000, (2 * Math.floor(i / 2)) / d);
      return v + (i % 2 === 0 ? Math.sin(pos / div) : Math.cos(pos / div));
    }),
  );
}

function downsample(X: Mat, maxTokens: number): Mat {
  if (X.length <= maxTokens) return X;
  const stride = X.length / maxTokens;
  const out: Mat = [];
  for (let i = 0; i < maxTokens; i++) {
    const a = Math.floor(i * stride);
    const b = Math.max(a + 1, Math.floor((i + 1) * stride));
    const dim = X[0]!.length;
    const row = new Array<number>(dim).fill(0);
    for (let j = a; j < b && j < X.length; j++) for (let c = 0; c < dim; c++) row[c] = row[c]! + X[j]![c]! / (b - a);
    out.push(row);
  }
  return out;
}

export interface ForwardResult {
  p: number;
  attention: number[][]; // last layer, head-averaged attention map
  pooled: number[];
  tokens: number;
  logit: number;
}

/**
 * Heuristic readout calibration (documented, untrained): the encoder embedding is
 * combined with waveform severity statistics of the observation window so the
 * demo produces a meaningful, reproducible instability probability.
 */
function severity(Xnorm: Mat): number {
  if (Xnorm.length < 2) return 0;
  let drift = 0;
  let ramp = 0;
  const dim = Xnorm[0]!.length;
  for (let c = 0; c < dim; c++) {
    const first = Xnorm[0]![c]!;
    const last = Xnorm[Xnorm.length - 1]![c]!;
    ramp += Math.abs(last - first);
    let d = 0;
    for (let i = 1; i < Xnorm.length; i++) d += Math.abs(Xnorm[i]![c]! - Xnorm[i - 1]![c]!);
    drift += d / (Xnorm.length - 1);
  }
  return ramp / dim + 2 * (drift / dim);
}

export function forward(
  Xnorm: Mat,
  weights: ModelWeights,
  opts: { dropout: number; rand: (() => number) | null },
): ForwardResult {
  const d = ARCH.dModel;
  const heads = ARCH.nHeads;
  const dk = d / heads;
  let H = addPositional(matmul(downsample(Xnorm, ARCH.maxTokens), weights.proj));
  H = dropoutMat(H, opts.dropout, opts.rand);
  let attnAvg: Mat = [];

  for (const L of weights.layers) {
    const Q = matmul(H, L.Wq);
    const K = matmul(H, L.Wk);
    const V = matmul(H, L.Wv);
    const T = H.length;
    const ctx: Mat = Array.from({ length: T }, () => new Array<number>(d).fill(0));
    const attnSum: Mat = Array.from({ length: T }, () => new Array<number>(T).fill(0));

    for (let h = 0; h < heads; h++) {
      const off = h * dk;
      for (let i = 0; i < T; i++) {
        const scores = new Array<number>(T).fill(0);
        for (let j = 0; j < T; j++) {
          let s = 0;
          for (let c = 0; c < dk; c++) s += Q[i]![off + c]! * K[j]![off + c]!;
          scores[j] = s / Math.sqrt(dk);
        }
        const a = softmaxRow(scores);
        for (let j = 0; j < T; j++) {
          attnSum[i]![j] = attnSum[i]![j]! + a[j]! / heads;
          for (let c = 0; c < dk; c++) ctx[i]![off + c] = ctx[i]![off + c]! + a[j]! * V[j]![off + c]!;
        }
      }
    }
    attnAvg = attnSum;
    const projected = dropoutMat(matmul(ctx, L.Wo), opts.dropout, opts.rand);
    H = layerNorm(H.map((row, i) => row.map((v, j) => v + projected[i]![j]!)));
    const ff1 = matmul(H, L.W1).map((row) => row.map((v) => Math.max(0, v)));
    const ff2 = dropoutMat(matmul(ff1, L.W2), opts.dropout, opts.rand);
    H = layerNorm(H.map((row, i) => row.map((v, j) => v + ff2[i]![j]!)));
  }

  // temporal (mean) pooling
  const pooled = new Array<number>(d).fill(0);
  for (const row of H) for (let j = 0; j < d; j++) pooled[j] = pooled[j]! + row[j]! / H.length;

  let emb = 0;
  for (let j = 0; j < d; j++) emb += pooled[j]! * weights.head[j]!;
  const logit = 1.6 * emb + 2.4 * severity(Xnorm) - 2.6 + weights.headBias;
  const p = 1 / (1 + Math.exp(-logit));
  return { p, attention: attnAvg, pooled, tokens: H.length, logit };
}