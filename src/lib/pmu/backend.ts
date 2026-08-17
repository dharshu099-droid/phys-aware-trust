export type BackendModelStatus = "UNTRAINED" | "TRAINED_UNCALIBRATED" | "READY";

export interface BackendPhysics {
  available: boolean;
  reason?: string;
  R_phy: number | null;
  samples: number;
  time_ms?: number[];
  residual_rad_per_s?: number[];
  theta_dot_rad_per_s?: number[];
  frequency_implied_rad_per_s?: number[];
}

export interface BackendPrediction {
  model_status: BackendModelStatus;
  window_ms: number;
  samples: number;
  physics: BackendPhysics;
  P_stable: number | null;
  P_unstable: number | null;
  U_evi: number | null;
  evidence: number[] | null;
  R_phy_norm: number | null;
  S_rel: number | null;
  decision: "Stable" | "Unstable" | "Uncertain";
  reason?: string;
  calibration?: {
    R0: number;
    alpha_rel: number;
    beta_rel: number;
    tau_stable: number;
    tau_unstable: number;
    tau_reliability: number;
  };
}

export interface BackendInspection {
  file: string;
  sha256: string;
  rows: number;
  columns: Record<string, string | string[] | null>;
  feature_names: string[];
  pmu_locations: string[];
  phases: string[];
  sampling_interval_ms: number;
  sampling_rate_hz: number;
  nominal_frequency_hz: number;
  angle_unit_detected: string | null;
  missing_values_filled: number;
  event_onset_ms: number;
  label: "Stable" | "Unstable" | null;
  windows: Record<string, { samples: number; start_index: number; end_index: number }>;
}

export interface BackendAnalysis {
  inspection: BackendInspection;
  model: { status: BackendModelStatus; reason?: string };
  windows: Record<string, BackendPrediction>;
}

export const DEFAULT_PMU_API_URL = (import.meta.env.VITE_PMU_API_URL as string | undefined)?.replace(/\/$/, "") ?? (typeof window !== "undefined" ? window.location.origin : "");

export function getPmuApiUrl() {
  if (typeof window === "undefined") return DEFAULT_PMU_API_URL;
  return window.localStorage.getItem("pmu-api-url")?.replace(/\/$/, "") || DEFAULT_PMU_API_URL;
}

export function setPmuApiUrl(value: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("pmu-api-url", value.trim().replace(/\/$/, ""));
}

export async function analyzePmuFile(file: File, nominalFrequency: number): Promise<BackendAnalysis> {
  const form = new FormData();
  form.append("file", file);
  form.append("nominal_frequency", String(nominalFrequency));
  form.append("angle_unit", "auto");
  const response = await fetch(`${getPmuApiUrl()}/predict/windows`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? `Backend returned ${response.status}`);
  return payload as BackendAnalysis;
}

export interface OneClassPrediction {
  file: string;
  rows: number;
  angle_column: string;
  decision: "Normal" | "Anomalous";
  anomaly_probability: number;
  normal_probability: number;
  anomaly_score: number;
  threshold: number;
  reliability_score: number;
  model_status: "READY_ONE_CLASS";
  warning: string;
}

export async function analyzeAnomalyFile(file: File): Promise<OneClassPrediction> {
  const form = new FormData();
  form.append("file", file);
  const origin = typeof window !== "undefined" ? window.location.origin : getPmuApiUrl();
  const response = await fetch(`${origin}/api/anomaly/predict`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? `Backend returned ${response.status}`);
  return payload as OneClassPrediction;
}

async function postFiles(path: string, files: File[], fields: Record<string, string | number>) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  const response = await fetch(`${getPmuApiUrl()}${path}`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? `Backend returned ${response.status}`);
  return payload as Record<string, unknown>;
}

export function trainPmuModel(files: File[], nominalFrequency: number, windowMs: number, epochs: number) {
  return postFiles("/train", files, { nominal_frequency: nominalFrequency, window_ms: windowMs, epochs });
}

export function calibratePmuModel(files: File[], nominalFrequency: number) {
  return postFiles("/calibrate", files, { nominal_frequency: nominalFrequency });
}

export function evaluatePmuModel(files: File[], nominalFrequency: number) {
  return postFiles("/evaluate", files, { nominal_frequency: nominalFrequency });
}
