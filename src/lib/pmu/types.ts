export type ChannelKey = "V" | "theta" | "f" | "I" | "P" | "Q";

export const CHANNELS: { key: ChannelKey; label: string; unit: string }[] = [
  { key: "V", label: "Voltage magnitude", unit: "pu" },
  { key: "theta", label: "Voltage phase angle", unit: "deg" },
  { key: "f", label: "Frequency", unit: "Hz" },
  { key: "I", label: "Current", unit: "pu" },
  { key: "P", label: "Active power", unit: "pu" },
  { key: "Q", label: "Reactive power", unit: "pu" },
];

export interface PmuEvent {
  id: string;
  name: string;
  origin: "demo" | "upload";
  provenance: string;
  timestamp: string;
  substation: string;
  nominalFrequency: 50 | 60;
  angleUnit: "deg" | "rad";
  dt: number; // seconds between samples
  eventTime: number; // seconds from start, approximate disturbance onset
  t: number[];
  channels: Partial<Record<ChannelKey, number[]>>;
  groundTruth?: "stable" | "unstable" | null;
  notes?: string;
}

export interface PipelineConfig {
  windowMs: number;
  K: number;
  dropout: number;
  seed: number;
  alpha: number;
  beta: number;
  U0: number;
  R0: number;
  tauS: number;
  tauU: number;
  tauR: number;
  nominalFrequency: 50 | 60;
  noisePct: number;
  maskedChannels: ChannelKey[];
}

export const DEFAULT_CONFIG: PipelineConfig = {
  windowMs: 200,
  K: 30,
  dropout: 0.2,
  seed: 20260812,
  alpha: 1.0,
  beta: 1.0,
  U0: 0.01,
  R0: 2.0,
  tauS: 0.35,
  tauU: 0.65,
  tauR: 0.5,
  nominalFrequency: 50,
  noisePct: 0,
  maskedChannels: [],
};