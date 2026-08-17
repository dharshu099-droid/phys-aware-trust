import type { ChannelKey } from "./types";

export interface PhysicsResult {
  available: boolean;
  reason?: string;
  Rphy: number;
  residuals: number[];
  thetaDot: number[]; // rad/s, from finite differences
  freqImplied: number[]; // 2*pi*(f - f0), rad/s
  t: number[];
  band: "low" | "moderate" | "high";
}

/**
 * PMU physics consistency:  dtheta/dt ~= 2*pi*(f - f0)
 * residual r(t) = thetaDot(t) - 2*pi*(f(t) - f0),  R_phy = sqrt(mean(r^2))
 * Angles supplied in degrees are converted to radians first.
 */
export function physicsResidual(
  seq: { X: number[][]; channels: ChannelKey[]; t: number[] },
  opts: { dt: number; f0: number; angleUnit: "deg" | "rad"; bands: [number, number] },
): PhysicsResult {
  const iTheta = seq.channels.indexOf("theta");
  const iF = seq.channels.indexOf("f");
  const empty: PhysicsResult = {
    available: false,
    Rphy: NaN,
    residuals: [],
    thetaDot: [],
    freqImplied: [],
    t: [],
    band: "low",
  };
  if (iTheta < 0 || iF < 0)
    return {
      ...empty,
      reason:
        "PMU physics-consistency calculation unavailable for this observation - both voltage phase angle and frequency channels are required.",
    };
  if (seq.X.length < 3)
    return { ...empty, reason: "Observation window too short for a finite-difference phase rate." };

  const k = opts.angleUnit === "deg" ? Math.PI / 180 : 1;
  const thetaDot: number[] = [];
  const freqImplied: number[] = [];
  const residuals: number[] = [];
  const t: number[] = [];
  const theta = seq.X.map((row) => row[iTheta]! * k);
  for (let i = 1; i < theta.length; i++) {
    while (theta[i]! - theta[i - 1]! > Math.PI) theta[i] = theta[i]! - 2 * Math.PI;
    while (theta[i]! - theta[i - 1]! < -Math.PI) theta[i] = theta[i]! + 2 * Math.PI;
  }
  for (let i = 0; i < seq.X.length - 1; i++) {
    const d = (theta[i + 1]! - theta[i]!) / opts.dt;
    const impl = 2 * Math.PI * (seq.X[i]![iF]! - opts.f0);
    thetaDot.push(d);
    freqImplied.push(impl);
    residuals.push(d - impl);
    t.push(seq.t[i]!);
  }
  const Rphy = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / residuals.length);
  const band = Rphy <= opts.bands[0] ? "low" : Rphy <= opts.bands[1] ? "moderate" : "high";
  return { available: true, Rphy, residuals, thetaDot, freqImplied, t, band };
}
