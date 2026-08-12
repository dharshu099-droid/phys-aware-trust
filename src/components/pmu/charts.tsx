import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
};

export function SignalChart({
  data,
  dataKey,
  color = "var(--chart-1)",
  unit,
  eventTime,
  window,
  height = 170,
  yLabel,
}: {
  data: { t: number; [k: string]: number }[];
  dataKey: string;
  color?: string;
  unit?: string;
  eventTime?: number;
  window?: [number, number];
  height?: number;
  yLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis dataKey="t" {...axis} tickFormatter={(v: number) => `${(v * 1000).toFixed(0)}`} minTickGap={28} />
        <YAxis {...axis} width={54} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => [`${v.toFixed(4)}${unit ? ` ${unit}` : ""}`, yLabel ?? dataKey]}
          labelFormatter={(v: number) => `t = ${(v * 1000).toFixed(1)} ms`}
        />
        {window ? (
          <ReferenceArea x1={window[0]} x2={window[1]} fill="var(--chart-2)" fillOpacity={0.14} />
        ) : null}
        {eventTime !== undefined ? (
          <ReferenceLine x={eventTime} stroke="var(--unstable)" strokeDasharray="4 3" />
        ) : null}
        <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.7} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MultiLineChart({
  data,
  series,
  height = 210,
  xKey = "x",
  xFormatter = (v: number) => String(v),
}: {
  data: Record<string, number>[];
  series: { key: string; name: string; color: string }[];
  height?: number;
  xKey?: string;
  xFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormatter} />
        <YAxis {...axis} width={54} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} dot={false} strokeWidth={1.7} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HistogramChart({ data, height = 170 }: { data: { bin: string; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -14 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis dataKey="bin" {...axis} />
        <YAxis {...axis} width={44} allowDecimals={false} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="count" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RunsChart({ samples, mean, height = 170 }: { samples: number[]; mean: number; height?: number }) {
  const data = samples.map((p, i) => ({ run: i + 1, p }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="var(--grid-line)" />
        <XAxis dataKey="run" type="number" name="Run" {...axis} domain={[0, samples.length + 1]} />
        <YAxis dataKey="p" type="number" name="p" {...axis} width={54} domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip {...tooltipStyle} />
        <ReferenceLine y={mean} stroke="var(--chart-1)" strokeDasharray="4 3" />
        <Scatter data={data} fill="var(--chart-3)" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function AreaTrend({
  data,
  dataKey,
  color = "var(--chart-1)",
  height = 180,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke="var(--grid-line)" vertical={false} />
        <XAxis dataKey="window" {...axis} />
        <YAxis {...axis} width={54} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip {...tooltipStyle} />
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.16} strokeWidth={1.8} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ProbabilityGauge({ p }: { p: number }) {
  const clamped = Math.min(1, Math.max(0, p));
  const angle = -90 + clamped * 180;
  const tone = clamped >= 0.65 ? "var(--unstable)" : clamped <= 0.35 ? "var(--stable)" : "var(--uncertain)";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-full max-w-[280px]">
        <path d="M14 104 A86 86 0 0 1 66.5 24.6" fill="none" stroke="var(--stable)" strokeWidth="12" opacity="0.35" />
        <path d="M66.5 24.6 A86 86 0 0 1 133.5 24.6" fill="none" stroke="var(--uncertain)" strokeWidth="12" opacity="0.35" />
        <path d="M133.5 24.6 A86 86 0 0 1 186 104" fill="none" stroke="var(--unstable)" strokeWidth="12" opacity="0.35" />
        <g transform={`rotate(${angle} 100 104)`}>
          <line x1="100" y1="104" x2="100" y2="30" stroke={tone} strokeWidth="3.5" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="104" r="5" fill={tone} />
        <text x="14" y="114" fontSize="9" fill="var(--muted-foreground)">
          0.0 stable
        </text>
        <text x="150" y="114" fontSize="9" fill="var(--muted-foreground)">
          1.0 unstable
        </text>
      </svg>
      <p className="mono-num text-2xl font-semibold" style={{ color: tone }}>
        {clamped.toFixed(3)}
      </p>
    </div>
  );
}