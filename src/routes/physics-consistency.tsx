import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { PHYSICS_BANDS } from "@/lib/pmu/inference";
import { ChannelMask } from "@/components/pmu/controls";
import { MultiLineChart, SignalChart } from "@/components/pmu/charts";
import { DemoNotice, Formula, MetricCard, ModelStatusNotice, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";

export const Route = createFileRoute("/physics-consistency")({
  head: () => ({
    meta: [
      { title: "PMU Physics Consistency — Phase-Frequency Residual" },
      {
        name: "description",
        content:
          "Check the measured voltage phase-angle rate against the PMU frequency deviation and turn the residual into a physics-consistency penalty for the reliability score.",
      },
      { property: "og:title", content: "PMU Physics Consistency" },
      {
        property: "og:description",
        content: "dθ/dt versus 2π(f − f₀): residual time series, RMS residual and its band classification.",
      },
    ],
  }),
  component: PhysicsPage,
});

function PhysicsPage() {
  const { result, cfg } = usePmu();
  const phy = result.physics;

  const compare = phy.t.map((t, i) => ({
    x: t,
    thetaDot: phy.thetaDot[i] ?? 0,
    implied: phy.freqImplied[i] ?? 0,
  }));
  const residual = phy.t.map((t, i) => ({ t, value: phy.residuals[i] ?? 0 }));

  return (
    <>
      <PageHeader
        eyebrow="Physics consistency"
        title="Phase-Angle Rate versus Measured Frequency"
        description="Synchrophasor measurements must satisfy an internal relation: the time derivative of the voltage phase angle tracks the frequency deviation from nominal. When the two disagree, the observation itself is suspect — bad data, a sensor fault or a numerically difficult transient — and the model's confidence should be discounted regardless of how decisive its probability looks."
      />
      <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />

      <SectionCard title="Consistency relation" subtitle="Finite-difference derivative against the PMU-reported frequency.">
        <div className="space-y-3">
          <Formula label="Physical relation between phase angle and frequency, with f₀ the nominal system frequency.">
            dθ/dt ≈ 2π ( f(t) − f₀ ),&nbsp;&nbsp;f₀ = {cfg.nominalFrequency} Hz
          </Formula>
          <Formula label="Per-sample residual from the forward finite difference.">
            r(t) = (θ_{"{"}t+1{"}"} − θ_t)/Δt − 2π ( f_t − f₀ )
          </Formula>
          <Formula label="Scalar physics-consistency residual over the observation window.">
            R_phy = √( (1/N) Σ_t r(t)² )
          </Formula>
        </div>
      </SectionCard>

      {!phy.available ? (
        <>
          <SectionCard title="Physics check unavailable">
            <p className="text-sm text-foreground">{phy.reason}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The pipeline does not substitute a default residual in this case. Instead, the physics term is dropped from
              the reliability score, the score is reported as uncertainty-only, and the limitation is stated with the
              result. Restore the voltage phase angle (θ) and frequency (f) channels below to re-enable the check.
            </p>
          </SectionCard>
          <SectionCard title="Channel availability" subtitle="Masking θ or f disables the physics-consistency term.">
            <ChannelMask />
          </SectionCard>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="RMS residual R_phy"
              value={fmt(phy.Rphy, 4)}
              unit="rad/s"
              tone={phy.band === "high" ? "unstable" : phy.band === "moderate" ? "uncertain" : "stable"}
              hint={`${phy.band} inconsistency band`}
            />
            <MetricCard label="Normalised R̃" value={fmt(result.rel.Rtilde, 4)} hint={`R/(R + R₀), R₀ = ${cfg.R0}`} />
            <MetricCard
              label="Physics penalty factor"
              value={fmt(Math.exp(-cfg.beta * (result.rel.Rtilde ?? 0)), 4)}
              hint={`exp(−β·R̃) with β = ${cfg.beta}`}
            />
            <MetricCard label="Residual samples" value={`${phy.residuals.length}`} hint="Finite differences in the window" />
          </div>

          <SectionCard
            title="dθ/dt versus 2π(f − f₀)"
            subtitle="Two independent views of the same physical quantity; agreement indicates trustworthy synchrophasor data."
          >
            <MultiLineChart
              data={compare}
              xKey="x"
              xFormatter={(v) => `${(v * 1000).toFixed(0)}`}
              series={[
                { key: "thetaDot", name: "dθ/dt (rad/s)", color: "var(--chart-4)" },
                { key: "implied", name: "2π(f − f₀) (rad/s)", color: "var(--chart-2)" },
              ]}
              height={250}
            />
          </SectionCard>

          <SectionCard title="Residual time series" subtitle="r(t) in rad/s; sustained departures from zero drive R_phy up.">
            <SignalChart data={residual} dataKey="value" color="var(--chart-5)" unit="rad/s" yLabel="r(t)" height={210} />
          </SectionCard>

          <SectionCard title="Band classification" subtitle="Interpretation thresholds used by the prototype.">
            <ul className="space-y-2 text-sm">
              <li className="rounded-md border border-border px-3 py-2">
                <span className="mono-num text-xs">R_phy ≤ {PHYSICS_BANDS[0]}</span> — <strong>low</strong>: measurements are
                internally consistent; the physics term barely penalises the score.
              </li>
              <li className="rounded-md border border-border px-3 py-2">
                <span className="mono-num text-xs">
                  {PHYSICS_BANDS[0]} &lt; R_phy ≤ {PHYSICS_BANDS[1]}
                </span>{" "}
                — <strong>moderate</strong>: a fast transient or mild data quality issue; confidence is reduced.
              </li>
              <li className="rounded-md border border-border px-3 py-2">
                <span className="mono-num text-xs">R_phy &gt; {PHYSICS_BANDS[1]}</span> — <strong>high</strong>: phase and
                frequency disagree strongly; treat the observation as unreliable rather than acting on the prediction.
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              These band edges and the scale R₀ are prototype defaults for illustration. In a research deployment both would
              be selected on a validation split of the target system, not assumed.
            </p>
          </SectionCard>
        </>
      )}

      <DemoNotice>
        The residual is computed from the actual channels of the selected record with a first-order finite difference, so
        the numbers on this page are genuine outputs of the physics module. Sampling noise and angle unwrapping choices
        both influence R_phy, which is why it is used as a soft penalty rather than a hard reject.
      </DemoNotice>
    </>
  );
}
