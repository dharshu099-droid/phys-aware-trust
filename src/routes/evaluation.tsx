import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePmu } from "@/lib/pmu/store";
import { prepare, runInference } from "@/lib/pmu/inference";
import { DecisionBadge, DemoNotice, Formula, MetricCard, ModelStatusNotice, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation Protocol — Metrics, Baselines & Limitations" },
      {
        name: "description",
        content:
          "The evaluation protocol for reliability-aware stability assessment: coverage, selective risk, calibration, baselines and what this prototype cannot claim.",
      },
      { property: "og:title", content: "Evaluation Protocol" },
      {
        property: "og:description",
        content: "Per-event outputs across all loaded records plus the metric definitions a full study would report.",
      },
    ],
  }),
  component: EvaluationPage,
});

function EvaluationPage() {
  const { events, cfg, result } = usePmu();

  const rows = useMemo(
    () =>
      events.map((e) => {
        const r = runInference(prepare(e), { ...cfg, nominalFrequency: e.nominalFrequency, maskedChannels: [], noisePct: 0 });
        return { e, r };
      }),
    [events, cfg],
  );

  const labelled = rows.filter((x) => x.e.groundTruth);
  const decided = labelled.filter((x) => x.r.rel.decision !== "Uncertain");
  const correct = decided.filter((x) => x.r.rel.decision.toLowerCase() === x.e.groundTruth).length;
  const coverage = labelled.length ? decided.length / labelled.length : null;
  const selectiveAcc = decided.length ? correct / decided.length : null;

  return (
    <>
      <PageHeader
        eyebrow="Evaluation"
        title="How This Framework Should Be Evaluated"
        description="A reliability-aware classifier cannot be summarised by accuracy alone, because it is allowed to abstain. The protocol below is the one this method requires; the table reports what the prototype actually produces on the records currently loaded, with no aggregation over data it has not seen."
      />
      <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />

      <DemoNotice>
        <strong>No experimental results are invented here.</strong> The loaded records may include illustrative demo events
        or user uploads, and model metrics remain unavailable until a labelled model is trained, calibrated, and evaluated
        by the Python backend. Session values are not
        benchmark numbers, they are not comparable to published transient-stability assessment results, and they must not
        be cited as evidence of accuracy, earliness or calibration.
      </DemoNotice>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Records loaded" value={`${rows.length}`} hint="demo events plus uploads" />
        <MetricCard label="With a ground-truth label" value={`${labelled.length}`} hint="required for any accuracy figure" />
        <MetricCard
          label="Coverage (session)"
          value={coverage === null ? "n/a" : `${(coverage * 100).toFixed(0)}%`}
          hint="fraction of labelled records not abstained on"
        />
        <MetricCard
          label="Selective accuracy (session)"
          value={selectiveAcc === null ? "n/a" : `${(selectiveAcc * 100).toFixed(0)}%`}
          hint="accuracy on the covered subset only"
        />
      </div>

      <SectionCard title="Per-record output" subtitle="Each row is a full pipeline run at the current configuration, noise-free and with all channels active.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Event</TableHead>
              <TableHead className="text-xs">Origin</TableHead>
              <TableHead className="text-xs">p̄</TableHead>
              <TableHead className="text-xs">U</TableHead>
              <TableHead className="text-xs">R_phy</TableHead>
              <TableHead className="text-xs">S_rel</TableHead>
              <TableHead className="text-xs">Decision</TableHead>
              <TableHead className="text-xs">Ground truth</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ e, r }) => (
              <TableRow key={e.id}>
                <TableCell className="mono-num text-xs font-semibold">{e.id}</TableCell>
                <TableCell className="text-xs">{e.origin === "demo" ? "Illustrative demo" : "Upload"}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.unc.pbar)}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.unc.U, 5)}</TableCell>
                <TableCell className="mono-num text-xs">{r.physics.available ? fmt(r.physics.Rphy) : "unavailable"}</TableCell>
                <TableCell className="mono-num text-xs">{fmt(r.rel.Srel)}</TableCell>
                <TableCell>
                  <DecisionBadge decision={r.rel.decision} />
                </TableCell>
                <TableCell className="text-xs">{e.groundTruth ?? "not available"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Metric definitions" subtitle="What a complete study must report for a model that may abstain.">
        <div className="space-y-3">
          <Formula label="Coverage: the fraction of events on which the framework commits to a decision.">
            coverage = |{"{"} i : decision_i ≠ Uncertain {"}"}| / N
          </Formula>
          <Formula label="Selective risk: error rate restricted to the covered subset. Reported jointly with coverage — never alone.">
            risk_sel = ( Σ_i 1[decision_i ≠ Uncertain] · 1[decision_i ≠ y_i] ) / ( Σ_i 1[decision_i ≠ Uncertain] )
          </Formula>
          <Formula label="Expected calibration error over M probability bins.">
            ECE = Σ_{"{"}m=1{"}"}^M (|B_m| / N) · | acc(B_m) − conf(B_m) |
          </Formula>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Class-wise recall.</strong> Missed instability and false alarm carry very
              different operating costs, so per-class recall and the confusion matrix are mandatory, not just accuracy.
            </li>
            <li>
              <strong className="text-foreground">Risk–coverage curve.</strong> Sweep τ_R and plot selective risk against
              coverage; the area under this curve is the honest summary of a reliability-aware system.
            </li>
            <li>
              <strong className="text-foreground">Earliness.</strong> Report the observation window used for every number.
              Comparing a 100 ms result with a 500 ms baseline is not a like-for-like comparison.
            </li>
            <li>
              <strong className="text-foreground">Reliability diagram and Brier score.</strong> Needed to support any claim
              that the probabilities, not just the decisions, are trustworthy.
            </li>
            <li>
              <strong className="text-foreground">Split discipline.</strong> Thresholds, α, β, U₀ and R₀ must be chosen on a
              validation split; the test split is touched once.
            </li>
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="Baselines the method must be compared against" subtitle="Each isolates one component of the contribution.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Baseline</TableHead>
              <TableHead className="text-xs">What it isolates</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["Classical time-domain / energy-function stability index", "Value of learning at all"],
              ["Feature-engineered classifier (SVM, gradient boosting)", "Value of sequence modelling"],
              ["CNN or LSTM on the same PMU window", "Value of CfC continuous-time dynamics"],
              ["CfC with a conventional softmax head", "Value of evidential learning"],
              ["Evidential CfC without the physics term", "Value of physics calibration"],
              ["Full framework with abstention disabled", "Cost of forcing a binary decision"],
            ].map(([b, w]) => (
              <TableRow key={b}>
                <TableCell className="text-xs font-medium">{b}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{w}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          No baseline numbers are shown, because none have been measured in this environment. Populating this table with
          plausible-looking values would fabricate results.
        </p>
      </SectionCard>

      <SectionCard title="Limitations of this prototype" subtitle="Stated explicitly so the demonstration is not over-read.">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>The current model status is {result.modelStatus}; no performance claim is made unless evaluation uses a held-out labelled test set.</li>
          <li>Built-in events are synthetic waveforms generated for illustration; they are not Transmission Signature Library records, archive entries or field measurements.</li>
          <li>The physics check covers one relation (phase rate versus frequency deviation) at a single observation point; it is not a state-estimation or full network consistency check.</li>
          <li>R₀, reliability weights, and decision thresholds are accepted only from the backend calibration artifact created from labelled validation data.</li>
          <li>Evidential uncertainty does not by itself cover every form of model misspecification or distribution shift across operating points.</li>
          <li>The system is decision support: it does not command switching, tripping or load shedding, and it is not a certified protection function.</li>
        </ul>
      </SectionCard>
    </>
  );
}
