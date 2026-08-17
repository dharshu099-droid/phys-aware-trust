import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { calibratePmuModel, evaluatePmuModel, getPmuApiUrl, setPmuApiUrl, trainPmuModel } from "@/lib/pmu/backend";
import { PageHeader, SectionCard, StatusPill } from "@/components/pmu/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/training-prediction")({
  head: () => ({ meta: [{ title: "Train & Predict — Evidential CfC" }] }),
  component: TrainingPredictionPage,
});

type JobState = { state: "idle" | "running" | "success" | "error"; message: string; output?: unknown };

function FileSummary({ files }: { files: File[] }) {
  if (!files.length) return <p className="text-xs text-muted-foreground">No files selected.</p>;
  return <ul className="max-h-32 space-y-1 overflow-auto text-xs text-muted-foreground">{files.map((file) => <li key={`${file.name}-${file.size}`}><span className="font-medium text-foreground">{file.name}</span> · {(file.size / 1024 / 1024).toFixed(2)} MB</li>)}</ul>;
}

function ResultBox({ job }: { job: JobState }) {
  if (job.state === "idle") return null;
  return <div className="rounded-md border border-border bg-secondary/40 p-3"><div className="flex items-center gap-2"><StatusPill status={job.state === "success" ? "completed" : "warning"}>{job.state}</StatusPill><p className="text-xs text-muted-foreground">{job.message}</p></div>{job.output ? <pre className="mono-num mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-foreground">{JSON.stringify(job.output, null, 2)}</pre> : null}</div>;
}

function TrainingPredictionPage() {
  const [apiUrl, setApiUrl] = useState(getPmuApiUrl());
  const [f0, setF0] = useState(50);
  const [windowMs, setWindowMs] = useState(200);
  const [epochs, setEpochs] = useState(40);
  const [trainingFiles, setTrainingFiles] = useState<File[]>([]);
  const [validationFiles, setValidationFiles] = useState<File[]>([]);
  const [evaluationFiles, setEvaluationFiles] = useState<File[]>([]);
  const [trainJob, setTrainJob] = useState<JobState>({ state: "idle", message: "" });
  const [calibrationJob, setCalibrationJob] = useState<JobState>({ state: "idle", message: "" });
  const [evaluationJob, setEvaluationJob] = useState<JobState>({ state: "idle", message: "" });

  async function run(kind: "train" | "calibrate" | "evaluate") {
    setPmuApiUrl(apiUrl);
    const files = kind === "train" ? trainingFiles : kind === "calibrate" ? validationFiles : evaluationFiles;
    const setter = kind === "train" ? setTrainJob : kind === "calibrate" ? setCalibrationJob : setEvaluationJob;
    if (!files.length) return setter({ state: "error", message: "Select CSV files first." });
    setter({ state: "running", message: `${kind === "train" ? "Training" : kind === "calibrate" ? "Calibrating" : "Evaluating"} on the Python backend…` });
    try {
      const output = kind === "train" ? await trainPmuModel(files, f0, windowMs, epochs) : kind === "calibrate" ? await calibratePmuModel(files, f0) : await evaluatePmuModel(files, f0);
      setter({ state: "success", message: `${kind} completed using backend results.`, output });
    } catch (error) {
      setter({ state: "error", message: error instanceof Error ? error.message : "Backend request failed." });
    }
  }

  return <>
    <PageHeader eyebrow="Model lifecycle" title="Train, Calibrate and Predict" description="Create a real evidential CfC artifact from labelled PMU events, calibrate reliability on separate validation events, then upload an unseen event for prediction. The existing dashboard consumes the resulting backend artifact." />

    <SectionCard title="Backend and experiment settings" subtitle="The Python service stores the trained model, scaler and calibration artifact.">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-semibold">Backend URL<Input className="mt-2" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} /></label>
        <label className="text-xs font-semibold">Nominal frequency f₀ (Hz)<Input className="mt-2" type="number" min="1" value={f0} onChange={(e) => setF0(Number(e.target.value))} /></label>
        <label className="text-xs font-semibold">Training window (ms)<select className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={windowMs} onChange={(e) => setWindowMs(Number(e.target.value))}>{[100, 200, 300, 500].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="text-xs font-semibold">Epochs<Input className="mt-2" type="number" min="1" max="500" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} /></label>
      </div>
      <Button className="mt-3" size="sm" variant="outline" onClick={() => setPmuApiUrl(apiUrl)}>Save backend URL</Button>
    </SectionCard>

    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard title="1. Training files" subtitle="At least four unique event CSVs, both classes, and an explicit event-level label column.">
        <div className="space-y-3"><Input type="file" accept=".csv,text/csv" multiple onChange={(e) => setTrainingFiles(Array.from(e.target.files ?? []))} /><FileSummary files={trainingFiles} /><Button disabled={trainJob.state === "running"} onClick={() => void run("train")}>{trainJob.state === "running" ? "Training…" : "Train CfC model"}</Button><ResultBox job={trainJob} /></div>
      </SectionCard>
      <SectionCard title="2. Validation files" subtitle="Separate labelled events calibrate R₀, α_rel, β_rel and decision thresholds.">
        <div className="space-y-3"><Input type="file" accept=".csv,text/csv" multiple onChange={(e) => setValidationFiles(Array.from(e.target.files ?? []))} /><FileSummary files={validationFiles} /><Button disabled={calibrationJob.state === "running"} onClick={() => void run("calibrate")}>{calibrationJob.state === "running" ? "Calibrating…" : "Calibrate reliability"}</Button><ResultBox job={calibrationJob} /></div>
      </SectionCard>
      <SectionCard title="3. Test files" subtitle="Held-out labelled events produce measured metrics only after training and calibration.">
        <div className="space-y-3"><Input type="file" accept=".csv,text/csv" multiple onChange={(e) => setEvaluationFiles(Array.from(e.target.files ?? []))} /><FileSummary files={evaluationFiles} /><Button disabled={evaluationJob.state === "running"} onClick={() => void run("evaluate")}>{evaluationJob.state === "running" ? "Evaluating…" : "Evaluate held-out set"}</Button><ResultBox job={evaluationJob} /></div>
      </SectionCard>
    </div>

    <SectionCard title="4. Predict an unseen event" subtitle="Prediction is enabled only when the backend reports a calibrated READY model.">
      <p className="text-sm text-muted-foreground">Open the existing PMU upload page, select one unseen CSV, and every dashboard feature will use its backend prediction, evidence, uncertainty, physics residual and reliability score.</p>
      <Button asChild className="mt-4"><Link to="/pmu-event-data">Open prediction upload</Link></Button>
    </SectionCard>

    <SectionCard title="Required label format" subtitle="Labels are ground truth—not frequency thresholds or filename guesses.">
      <p className="text-sm text-muted-foreground">Each event file must contain one column named <span className="mono-num text-foreground">label</span>, <span className="mono-num text-foreground">stability</span>, <span className="mono-num text-foreground">class</span>, or <span className="mono-num text-foreground">target</span>. Every row in that event must consistently contain <span className="mono-num text-foreground">Stable/Unstable</span> or <span className="mono-num text-foreground">0/1</span>. Unlabelled LBNL angle data can be inspected, but it cannot train this supervised classifier.</p>
    </SectionCard>
  </>;
}
