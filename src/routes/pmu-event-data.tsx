import { createFileRoute } from "@tanstack/react-router";
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
  const { event, pre, cfg, addEvent, result } = usePmu();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const available = CHANNELS.filter((c) => event.channels[c.key]);
  const windowStart = pre.event.t[result.seq.startIdx] ?? 0;
  const windowEnd = pre.event.t[result.seq.endIdx] ?? 0;

  const raw = (key: ChannelKey) =>
    (event.channels[key] ?? []).map((v, i) => ({ t: event.t[i] ?? i * event.dt, value: v }));
  const processed = (key: ChannelKey) =>
    (pre.event.channels[key] ?? []).map((v, i) => ({ t: pre.event.t[i] ?? i * pre.event.dt, value: v }));

  async function onUpload(file: File) {
    const text = await file.text();
    const res = parseCsv(text, file.name, { nominalFrequency: cfg.nominalFrequency, angleUnit: "deg" });
    if (!res.event) {
      setUploadMsg(res.errors.join(" "));
      return;
    }
    addEvent(res.event);
    setUploadMsg(
      `Loaded ${file.name}: ${res.detected.join(", ")} over ${res.event.t.length} samples. ${res.errors.join(" ")}`,
    );
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

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Event selection" subtitle="Multiple PMU events can be held in the session.">
          <div className="space-y-3">
            <EventSelector />
            <WindowSelector />
          </div>
        </SectionCard>
        <SectionCard
          title="Upload PMU CSV"
          subtitle="Header row plus one numeric row per sample. Recognised columns: t/time, V, theta, f, I, P, Q."
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
            <Button size="sm" onClick={() => fileRef.current?.click()} className="text-xs">
              Choose CSV file
            </Button>
            {uploadMsg ? <p className="mono-num text-xs text-muted-foreground">{uploadMsg}</p> : null}
            <p className="text-xs text-muted-foreground">
              Uploaded angles are assumed to be in degrees and are converted to radians before the physics check; set the
              nominal frequency in Advanced settings on the Reliability page to match the dataset.
            </p>
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