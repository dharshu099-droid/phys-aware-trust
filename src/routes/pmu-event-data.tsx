import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { usePmu } from "@/lib/pmu/store";
import { parseCsv } from "@/lib/pmu/dataLoader";
import { CHANNELS, type ChannelKey } from "@/lib/pmu/types";
import { EventSelector, WindowSelector } from "@/components/pmu/controls";
import { SignalChart } from "@/components/pmu/charts";
import { DemoNotice, KeyValue, PageHeader, SectionCard, StatusPill, fmt } from "@/components/pmu/ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { analyzeAnomalyFile, type OneClassPrediction } from "@/lib/pmu/backend";
import { downloadPredictionPdf } from "@/lib/pmu/pdfReport";

export const Route = createFileRoute("/pmu-event-data")({
  head: () => ({
    meta: [
      { title: "PMU Event Data — Physics-Calibrated Stability Assessment" },
      {
        name: "description",
        content:
          "Inspect PMU event metadata, upload a synchrophasor CSV and follow every preprocessing stage from time synchronisation to observation-window extraction.",
      },
      { property: "og:title", content: "PMU Event Data" },
      {
        property: "og:description",
        content: "PMU event dashboard with per-channel time series, disturbance marking and preprocessing status.",
      },
    ],
  }),
  component: EventDataPage,
});

const COLORS: Record<ChannelKey, string> = {
  V: "var(--chart-1)",
  theta: "var(--chart-4)",
  f: "var(--chart-2)",
  I: "var(--chart-5)",
  P: "var(--chart-3)",
  Q: "var(--chart-4)",
};

function EventDataPage() {
  const { event, pre, cfg, addEvent, updateEvent, removeEvent, result } = usePmu();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [anomaly, setAnomaly] = useState<OneClassPrediction | null>(null);
  const storedPrediction = event.referencePrediction;
  const displayedPrediction = anomaly ?? storedPrediction ?? null;
  const windowPrediction = displayedPrediction?.window_predictions?.[String(cfg.windowMs)] ?? displayedPrediction;

  const available = CHANNELS.filter((c) => event.channels[c.key]);
  const windowStart = pre.event.t[result.seq.startIdx] ?? 0;
  const windowEnd = pre.event.t[result.seq.endIdx] ?? 0;

  const raw = (key: ChannelKey) =>
    (event.channels[key] ?? []).map((v, i) => ({ t: event.t[i] ?? i * event.dt, value: v }));
  const processed = (key: ChannelKey) =>
    (pre.event.channels[key] ?? []).map((v, i) => ({ t: pre.event.t[i] ?? i * pre.event.dt, value: v }));

  async function onUpload(file: File) {
    setIsAnalyzing(true);
    setAnomaly(null);
    try {
      setUploadMsg(`Sampling ${file.name} and running the public predictor…`);
      const maxBytes = 2_500_000;
      let sampledText = await file.slice(0, Math.min(file.size, maxBytes)).text();
      if (file.size > maxBytes) sampledText = sampledText.slice(0, sampledText.lastIndexOf("\n") + 1);
      const sampledFile = new File([sampledText], file.name, { type: "text/csv" });
      const output = await analyzeAnomalyFile(sampledFile);
      setAnomaly(output);
      const isLbnl = file.name.startsWith("_LBNL") || file.name.startsWith("LBNL");
      const displayText = isLbnl ? `timestamp_ns,voltage_angle_deg\n${sampledText}` : sampledText;
      const res = parseCsv(displayText, file.name, { nominalFrequency: cfg.nominalFrequency, angleUnit: "deg" });
      if (res.event) {
        addEvent({ ...res.event, referencePrediction: output });
      } else {
        updateEvent(event.id, { referencePrediction: output });
      }
      setUploadMsg(`Analyzed ${file.name}${file.size > maxBytes ? ` using a ${(sampledFile.size / 1024 / 1024).toFixed(2)} MB representative prefix` : ""}.`);
    } catch (error) {
      setUploadMsg(`Loaded ${file.name}, but prediction failed: ${error instanceof Error ? error.message : "unknown error"}.`);
    } finally {
      setIsAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const cursorIdx = Math.min(pre.event.t.length - 1, Math.round((cursor / 100) * (pre.event.t.length - 1)));

  return (
    <>
      <PageHeader
        eyebrow="Dataset"
        title="PMU Event Data"
        description="Load a synchrophasor event, review its metadata and channels, and watch each preprocessing stage before the early observation window is extracted. The dataset module follows the column structure used by transmission signature libraries, but no bundled record is presented as a real archive entry."
      />

      <DemoNotice>
        {event.origin === "demo" ? (
          <>
            <strong>Illustrative Demo PMU Event.</strong> {event.provenance} {event.notes}
          </>
        ) : (
          <>
            <strong>Uploaded record.</strong> {event.provenance}
          </>
        )}
      </DemoNotice>

      {event.origin === "upload" && !displayedPrediction ? (
        <div className={`rounded-md border-2 p-5 ${result.rel.decision === "Stable" ? "border-stable/50 bg-stable/10" : result.rel.decision === "Unstable" ? "border-unstable/50 bg-unstable/10" : "border-uncertain/50 bg-uncertain/10"}`}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Live analysis result</p>
          <div className="mt-2 flex flex-wrap items-end gap-4">
            <p className="mono-num text-3xl font-bold text-foreground">{result.modelOutputAvailable ? result.rel.decision : result.modelStatus}</p>
            <StatusPill status={result.rel.decision === "Stable" ? "completed" : "warning"}>{result.rel.decision}</StatusPill>
          </div>
          <p className="mono-num mt-2 text-sm text-muted-foreground">
            P(stable): {fmt(result.modelOutputAvailable ? 1 - result.unc.pbar : null, 4)} · P(unstable): {fmt(result.modelOutputAvailable ? result.unc.pbar : null, 4)} · U_evi: {fmt(result.modelOutputAvailable ? result.unc.U : null, 4)} · R_phy: {fmt(result.physics.available ? result.physics.Rphy : null, 5)}
          </p>
          {result.statusReason ? <p className="mt-2 text-sm text-muted-foreground">{result.statusReason}</p> : null}
          <p className="mt-3 text-sm text-muted-foreground">The decision is calculated from CSV measurements, not the filename. Files with identical contents produce identical results even when their names say “under” or “over”.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["Early prediction", "/early-prediction"],
              ["AI model", "/ai-model"],
              ["Uncertainty", "/uncertainty"],
              ["Physics consistency", "/physics-consistency"],
              ["Reliability", "/reliability"],
              ["Stress test", "/stress-testing"],
              ["Evaluation", "/evaluation"],
            ].map(([label, to]) => (
              <Button key={to} asChild size="sm" variant="outline" className="text-xs">
                <Link to={to}>{label}</Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {displayedPrediction && windowPrediction ? (
        <div className={`rounded-md border-2 p-5 ${windowPrediction.screening_result === "Stable" ? "border-stable/50 bg-stable/10" : windowPrediction.screening_result === "Unstable" ? "border-unstable/50 bg-unstable/10" : "border-uncertain/50 bg-uncertain/10"}`}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Explainable PMU stability screening</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="mono-num text-3xl font-bold text-foreground">{windowPrediction.screening_result}</p>
            <Badge variant="outline" className="rounded-sm">Screening result</Badge>
            {windowPrediction.window_ms ? <Badge variant="outline" className="rounded-sm">{windowPrediction.window_ms} ms analysis</Badge> : null}
          </div>
          <p className="mono-num mt-3 text-sm text-muted-foreground">Stable proxy probability: {windowPrediction.normal_probability.toFixed(4)} · Unstable proxy probability: {windowPrediction.anomaly_probability.toFixed(4)} · Reliability score: {windowPrediction.reliability_score.toFixed(4)}</p>
          <p className="mono-num mt-1 text-sm text-muted-foreground">Anomaly score: {windowPrediction.anomaly_score.toFixed(5)} · calibrated threshold: {displayedPrediction.threshold.toFixed(5)} · rows: {displayedPrediction.rows}</p>
          <p className="mt-3 text-sm font-medium text-foreground">Why this result</p>
          <p className="mt-1 text-sm text-muted-foreground">{windowPrediction.reason}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border bg-background/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em]">Explainable feature contributions</p>
              <div className="mt-2 space-y-2">
                {displayedPrediction.feature_contributions.map((item) => (
                  <div key={item.feature}>
                    <div className="flex justify-between text-xs"><span>{item.feature}</span><span className="mono-num">{item.contribution_percent.toFixed(1)}%</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.max(1, item.contribution_percent)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border bg-background/60 p-3 text-sm">
              <p><strong>Suspected PMU measurement location:</strong> {displayedPrediction.suspected_pmu_location ?? "Not identifiable from CSV headers"}</p>
              <p className="mt-2"><strong>Abnormal onset:</strong> {displayedPrediction.disturbance_timing.detected && displayedPrediction.disturbance_timing.onset_ms !== null ? `${displayedPrediction.disturbance_timing.onset_ms.toFixed(1)} ms` : "No reliable onset detected"}</p>
              <p className="mt-2"><strong>Abnormal duration:</strong> {displayedPrediction.disturbance_timing.detected ? `${displayedPrediction.disturbance_timing.duration_ms.toFixed(1)} ms` : "0 ms above threshold"}</p>
              <p className="mt-2 text-xs text-muted-foreground">{displayedPrediction.disturbance_timing.method}.</p>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-uncertain/40 bg-background/60 p-3 text-xs text-muted-foreground">
            <p>{displayedPrediction.warning}</p>
            {displayedPrediction.limitations.map((item) => <p className="mt-1" key={item}>• {item}</p>)}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadPredictionPdf(event, cfg.windowMs)}>Export result as PDF</Button>
            <Button size="sm" variant="destructive" onClick={() => { if (window.confirm(`Delete ${event.name} and its saved result?`)) { removeEvent(event.id); setAnomaly(null); } }}>Delete saved result</Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Event selection" subtitle="Multiple PMU events can be held in the session.">
          <div className="space-y-3">
            <EventSelector />
            <WindowSelector />
          </div>
        </SectionCard>
        <SectionCard
          title="Upload PMU CSV"
          subtitle="Header row plus PMU samples. The backend detects timestamps, locations, phases, magnitudes, angles, frequency and ROCOF."
        >
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
            <Button size="sm" disabled={isAnalyzing} onClick={() => fileRef.current?.click()} className="text-xs">
              {isAnalyzing ? "Analyzing all features…" : "Choose CSV file"}
            </Button>
            {uploadMsg ? <p className="mono-num text-xs text-muted-foreground">{uploadMsg}</p> : null}
            <p className="text-xs text-muted-foreground">
              The Python backend detects degree/radian angle units, converts to radians and unwraps phase before
              differentiation. Set nominal frequency f₀ in Advanced settings on the Reliability page to match the dataset.
            </p>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <p className="text-xs font-semibold text-foreground">Download synthetic verification fixtures</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline"><a href="/downloads/synthetic-normal-pmu.csv" download>Normal test CSV</a></Button>
                <Button asChild size="sm" variant="outline"><a href="/downloads/synthetic-anomalous-pmu.csv" download>Anomalous test CSV</a></Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">These files are synthetic software checks derived from the calibrated feature ranges. They are not field measurements and must not be used as experimental results.</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Selected event"
        subtitle="Metadata as declared by the dataset module."
        right={
          <Badge variant="outline" className="rounded-sm text-[11px]">
            {event.origin === "demo" ? "Illustrative demo" : "User upload"}
          </Badge>
        }
      >
        <KeyValue
          items={[
            { k: "Event ID", v: event.id },
            { k: "Timestamp", v: new Date(event.timestamp).toISOString() },
            { k: "Observation point", v: event.substation },
            { k: "Available PMU channels", v: available.map((c) => c.key).join(", ") },
            { k: "Number of samples", v: `${event.t.length}` },
            { k: "Sampling interval", v: `${(event.dt * 1000).toFixed(3)} ms (${(1 / event.dt).toFixed(0)} Hz)` },
            { k: "Nominal frequency f₀", v: `${cfg.nominalFrequency} Hz` },
            { k: "Angle unit", v: event.angleUnit },
            {
              k: "Ground-truth stability label",
              v: event.groundTruth ?? "not available",
            },
            { k: "Approx. disturbance onset", v: `${(event.eventTime * 1000).toFixed(0)} ms` },
          ]}
        />
      </SectionCard>

      {event.backendAnalysis ? (
        <SectionCard title="Backend dataset inspection" subtitle="Automatically detected from the uploaded CSV; no filename-derived label is used.">
          <KeyValue
            items={[
              { k: "Model status", v: event.backendAnalysis.model.status },
              { k: "Detected PMU locations", v: event.backendAnalysis.inspection.pmu_locations.join(", ") || "not encoded in headers" },
              { k: "Detected phases", v: event.backendAnalysis.inspection.phases.join(", ") || "not encoded in headers" },
              { k: "Detected feature columns", v: event.backendAnalysis.inspection.feature_names.join(", ") },
              { k: "Sampling interval", v: `${event.backendAnalysis.inspection.sampling_interval_ms.toFixed(3)} ms (${event.backendAnalysis.inspection.sampling_rate_hz.toFixed(2)} Hz)` },
              { k: "Detected angle unit", v: event.backendAnalysis.inspection.angle_unit_detected ?? "no angle column" },
              { k: "Missing values filled", v: `${event.backendAnalysis.inspection.missing_values_filled}` },
              { k: "Valid stability label", v: event.backendAnalysis.inspection.label ?? "not available" },
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Preprocessing pipeline"
        subtitle="Each stage reports its own status; nothing is silently imputed."
      >
        <ul className="space-y-2">
          {pre.stages.map((s) => (
            <li key={s.name} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
              <span className="w-52 text-xs font-semibold text-foreground">{s.name}</span>
              <StatusPill status={s.status}>
                {s.status === "completed" ? "Completed" : s.status === "warning" ? "Attention" : "Skipped"}
              </StatusPill>
              <span className="text-xs text-muted-foreground">{s.detail}</span>
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
            <span className="w-52 text-xs font-semibold text-foreground">Observation-window extraction</span>
            <StatusPill status="completed">Completed</StatusPill>
            <span className="mono-num text-xs text-muted-foreground">
              {cfg.windowMs} ms → {result.seq.T} samples, t ∈ [{(windowStart * 1000).toFixed(0)},{" "}
              {(windowEnd * 1000).toFixed(0)}] ms
            </span>
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Disturbance timeline"
        subtitle="Dashed red line marks the approximate disturbance onset; the shaded band is the selected early observation window."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Slider value={[cursor]} min={0} max={100} step={1} onValueChange={([v]) => setCursor(v ?? 0)} />
            <span className="mono-num w-36 text-xs text-muted-foreground">
              cursor t = {((pre.event.t[cursorIdx] ?? 0) * 1000).toFixed(1)} ms
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((c) => (
              <div key={c.key} className="rounded-md border border-border px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{c.label}</p>
                <p className="mono-num text-sm text-foreground">
                  {fmt(pre.event.channels[c.key]?.[cursorIdx], 4)} {c.unit}
                </p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <Tabs defaultValue="processed">
        <TabsList>
          <TabsTrigger value="raw" className="text-xs">
            Raw data
          </TabsTrigger>
          <TabsTrigger value="processed" className="text-xs">
            Processed data
          </TabsTrigger>
          <TabsTrigger value="table" className="text-xs">
            Sample table
          </TabsTrigger>
        </TabsList>

        {(["raw", "processed"] as const).map((mode) => (
          <TabsContent key={mode} value={mode} className="mt-4 grid gap-4 lg:grid-cols-2">
            {available.map((c) => (
              <SectionCard key={c.key} title={`${c.label} (${c.unit})`} subtitle={mode === "raw" ? "As supplied" : "Synchronised & cleaned"}>
                <SignalChart
                  data={(mode === "raw" ? raw(c.key) : processed(c.key)).map((d) => ({ t: d.t, value: d.value }))}
                  dataKey="value"
                  color={COLORS[c.key]}
                  unit={c.unit}
                  yLabel={c.label}
                  eventTime={event.eventTime}
                  window={[windowStart, windowEnd]}
                />
              </SectionCard>
            ))}
          </TabsContent>
        ))}

        <TabsContent value="table" className="mt-4">
          <SectionCard title="First 25 processed samples" subtitle="Uniform time grid after synchronisation and cleaning.">
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">t (ms)</TableHead>
                    {available.map((c) => (
                      <TableHead key={c.key} className="text-xs">
                        {c.key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pre.event.t.slice(0, 25).map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="mono-num text-xs">{(t * 1000).toFixed(2)}</TableCell>
                      {available.map((c) => (
                        <TableCell key={c.key} className="mono-num text-xs">
                          {fmt(pre.event.channels[c.key]?.[i], 4)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
