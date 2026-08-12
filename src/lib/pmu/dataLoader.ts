import { CHANNELS, type ChannelKey, type PmuEvent } from "./types";

/** Deterministic PRNG so every illustrative demo event is reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type DemoKind = "unstable" | "stable" | "ambiguous";

interface DemoSpec {
  id: string;
  name: string;
  kind: DemoKind;
  substation: string;
  timestamp: string;
  nominalFrequency: 50 | 60;
  seed: number;
  notes: string;
}

const DEMO_SPECS: DemoSpec[] = [
  {
    id: "DEMO-EV-001",
    name: "Illustrative Demo PMU Event — three-phase fault, weak tie-line",
    kind: "unstable",
    substation: "Bus 14 (illustrative)",
    timestamp: "2026-04-11T09:14:22.000Z",
    nominalFrequency: 50,
    seed: 101,
    notes:
      "Synthetic waveform generated in-browser to exercise the pipeline. Frequency is integrated into the phase angle so the phase/frequency physics residual is genuinely low unless noise or masking is applied.",
  },
  {
    id: "DEMO-EV-002",
    name: "Illustrative Demo PMU Event — cleared fault, damped recovery",
    kind: "stable",
    substation: "Bus 7 (illustrative)",
    timestamp: "2026-04-11T11:02:05.000Z",
    nominalFrequency: 50,
    seed: 202,
    notes: "Synthetic damped electromechanical oscillation returning toward nominal.",
  },
  {
    id: "DEMO-EV-003",
    name: "Illustrative Demo PMU Event — marginal / ambiguous swing (60 Hz system)",
    kind: "ambiguous",
    substation: "Bus 22 (illustrative)",
    timestamp: "2026-04-11T14:40:51.000Z",
    nominalFrequency: 60,
    seed: 303,
    notes:
      "Synthetic marginally-damped swing with elevated measurement noise, intended to land in the Uncertain region.",
  },
];

const DT = 1 / 240; // 240 samples/s reporting rate
const PRE = 0.2; // seconds of pre-disturbance data
const POST = 0.9;

function buildDemo(spec: DemoSpec): PmuEvent {
  const rand = mulberry32(spec.seed);
  const n = Math.round((PRE + POST) / DT);
  const t: number[] = [];
  const V: number[] = [];
  const th: number[] = [];
  const f: number[] = [];
  const I: number[] = [];
  const P: number[] = [];
  const Q: number[] = [];
  const f0 = spec.nominalFrequency;
  const noise = spec.kind === "ambiguous" ? 0.0025 : 0.0012;
  let theta = spec.kind === "unstable" ? -4 : 6; // degrees

  for (let i = 0; i < n; i++) {
    const time = i * DT;
    const tau = time - PRE; // time since disturbance
    let df = 0;
    let v = 1.0;
    let p = 0.85;
    let q = 0.18;

    if (tau < 0) {
      df = 0.004 * Math.sin(2 * Math.PI * 0.6 * time);
    } else if (spec.kind === "unstable") {
      df = -0.9 * (1 - Math.exp(-tau / 0.45)) - 0.25 * Math.sin(2 * Math.PI * 1.4 * tau);
      v = 1.0 - 0.34 * (1 - Math.exp(-tau / 0.08)) + 0.05 * Math.sin(2 * Math.PI * 1.4 * tau);
      p = 0.85 - 0.5 * (1 - Math.exp(-tau / 0.12));
      q = 0.18 + 0.55 * (1 - Math.exp(-tau / 0.1));
    } else if (spec.kind === "stable") {
      const env = Math.exp(-tau / 0.22);
      df = 0.16 * env * Math.sin(2 * Math.PI * 1.1 * tau);
      v = 1.0 - 0.11 * env * Math.cos(2 * Math.PI * 1.1 * tau);
      p = 0.85 - 0.12 * env * Math.cos(2 * Math.PI * 1.1 * tau);
      q = 0.18 + 0.08 * env;
    } else {
      const env = Math.exp(-tau / 1.6);
      df = 0.42 * env * Math.sin(2 * Math.PI * 1.25 * tau) - 0.1 * tau;
      v = 1.0 - 0.19 * env * Math.cos(2 * Math.PI * 1.25 * tau);
      p = 0.85 - 0.26 * env * Math.cos(2 * Math.PI * 1.25 * tau);
      q = 0.18 + 0.24 * env;
    }

    const freq = f0 + df;
    // integrate dtheta/dt = 2*pi*(f - f0) [rad/s] -> degrees
    theta += ((2 * Math.PI * df * DT) as number) * (180 / Math.PI);

    t.push(Number(time.toFixed(6)));
    f.push(freq + noise * gaussian(rand) * 0.4);
    th.push(theta + noise * gaussian(rand) * 3);
    V.push(v + noise * gaussian(rand));
    P.push(p + noise * gaussian(rand) * 2);
    Q.push(q + noise * gaussian(rand) * 2);
    I.push(p / Math.max(v, 0.2) + noise * gaussian(rand) * 2);
  }

  return {
    id: spec.id,
    name: spec.name,
    origin: "demo",
    provenance:
      "Illustrative Demo PMU Event — synthetic values generated in the browser. Not a Transmission Signature Library (TSL) record and not a field measurement.",
    timestamp: spec.timestamp,
    substation: spec.substation,
    nominalFrequency: spec.nominalFrequency,
    angleUnit: "deg",
    dt: DT,
    eventTime: PRE,
    t,
    channels: { V, theta: th, f, I, P, Q },
    groundTruth: null,
    notes: spec.notes,
  };
}

export const DEMO_EVENTS: PmuEvent[] = DEMO_SPECS.map(buildDemo);

const ALIASES: Record<ChannelKey, string[]> = {
  V: ["v", "vm", "voltage", "voltage_magnitude", "vmag", "v_mag", "vpu"],
  theta: ["theta", "angle", "phase", "phase_angle", "va", "v_angle", "vang"],
  f: ["f", "freq", "frequency", "hz"],
  I: ["i", "im", "current", "current_magnitude", "imag", "i_mag"],
  P: ["p", "active_power", "mw", "p_mw", "pactive"],
  Q: ["q", "reactive_power", "mvar", "q_mvar", "qreactive"],
};

export interface ParseResult {
  event: PmuEvent | null;
  errors: string[];
  detected: ChannelKey[];
}

/** Minimal CSV loader: first row is a header, one numeric row per PMU sample. */
export function parseCsv(
  text: string,
  fileName: string,
  opts: { nominalFrequency: 50 | 60; angleUnit: "deg" | "rad" },
): ParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 3) return { event: null, errors: ["CSV needs a header row and at least two samples."], detected: [] };

  const sep = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = lines[0]!.split(sep).map((h) => h.trim().toLowerCase().replace(/[\s()[\]]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""));

  const colOf = (cands: string[]) => header.findIndex((h) => cands.includes(h));
  const timeIdx = colOf(["t", "time", "timestamp", "time_s", "seconds"]);
  const map: Partial<Record<ChannelKey, number>> = {};
  for (const c of CHANNELS) {
    const idx = colOf(ALIASES[c.key]);
    if (idx >= 0) map[c.key] = idx;
  }
  const frequencyIdx = header.findIndex((h) => h === "frequency");
  const voltageMagIdx = header.map((h, i) => (h.startsWith("mag_v") ? i : -1)).filter((i) => i >= 0);
  const voltageAngleIdx = header.map((h, i) => (h.startsWith("angle_v") ? i : -1)).filter((i) => i >= 0);
  const currentMagIdx = header.map((h, i) => (h.startsWith("mag_i") ? i : -1)).filter((i) => i >= 0);
  if (frequencyIdx >= 0) map.f = frequencyIdx;
  if (voltageMagIdx.length) map.V = voltageMagIdx[0];
  if (voltageAngleIdx.length) map.theta = voltageAngleIdx[0];
  if (currentMagIdx.length) map.I = currentMagIdx[0];
  const detected = Object.keys(map) as ChannelKey[];
  if (detected.length === 0)
    return {
      event: null,
      errors: [`No PMU channels recognised in header: ${header.join(", ")}. Expected columns such as V, theta, f, I, P, Q.`],
      detected: [],
    };

  const t: number[] = [];
  const channels: Partial<Record<ChannelKey, number[]>> = {};
  for (const k of detected) channels[k] = [];
  let missing = 0;

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r]!.split(sep);
    t.push(timeIdx >= 0 ? Number(cells[timeIdx]) : (r - 1) / 50);
    for (const k of detected) {
      const indices = k === "V" ? voltageMagIdx : k === "theta" ? voltageAngleIdx : k === "I" ? currentMagIdx : [map[k]!];
      const nums = indices.map((idx) => Number(cells[idx])).filter(Number.isFinite);
      const val = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
      if (!Number.isFinite(val)) missing++;
      channels[k]!.push(val);
    }
  }
  if (missing > 0) errors.push(`${missing} non-numeric / missing cell(s) detected — handled by the preprocessing stage.`);

  const dt = t.length > 1 && Number.isFinite(t[1]!) && Number.isFinite(t[0]!) ? Math.abs(t[1]! - t[0]!) || 1 / 50 : 1 / 50;
  const fixedT = t.map((v, i) => (Number.isFinite(v) ? v : i * dt));

  return {
    event: {
      id: `UP-${Date.now().toString(36).toUpperCase()}`,
      name: fileName,
      origin: "upload",
      provenance: `Uploaded CSV: ${fileName}. Provenance and units are as supplied by the user; the application performs no validation of field authenticity.`,
      timestamp: new Date().toISOString(),
      substation: "as supplied in file",
      nominalFrequency: opts.nominalFrequency,
      angleUnit: opts.angleUnit,
      dt,
      eventTime: fixedT[Math.floor(fixedT.length * 0.2)] ?? 0,
      t: fixedT,
      channels,
      groundTruth: null,
    },
    errors,
    detected,
  };
}
