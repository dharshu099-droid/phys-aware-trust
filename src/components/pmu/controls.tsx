import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHANNELS, type ChannelKey } from "@/lib/pmu/types";
import { usePmu } from "@/lib/pmu/store";
import { WINDOWS } from "@/lib/pmu/inference";
import { cn } from "@/lib/utils";

export function EventSelector() {
  const { events, eventId, setEventId } = usePmu();
  return (
    <Select value={eventId} onValueChange={setEventId}>
      <SelectTrigger className="h-9 w-full max-w-md text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {events.map((e) => (
          <SelectItem key={e.id} value={e.id} className="text-xs">
            {e.id} — {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WindowSelector() {
  const { cfg, setCfg } = usePmu();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {WINDOWS.map((w) => (
        <Button
          key={w}
          size="sm"
          variant={cfg.windowMs === w ? "default" : "outline"}
          className="h-8 px-3 text-xs"
          onClick={() => setCfg({ windowMs: w })}
        >
          {w} ms
        </Button>
      ))}
      <div className="ml-2 flex min-w-[190px] flex-1 items-center gap-3">
        <Slider
          value={[cfg.windowMs]}
          min={60}
          max={600}
          step={10}
          onValueChange={([v]) => setCfg({ windowMs: v ?? 200 })}
        />
        <span className="mono-num w-16 text-xs text-muted-foreground">{cfg.windowMs} ms</span>
      </div>
    </div>
  );
}

export function ChannelMask() {
  const { event, cfg, toggleChannel } = usePmu();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CHANNELS.map((c) => {
        const present = Boolean(event.channels[c.key]);
        const active = present && !cfg.maskedChannels.includes(c.key);
        return (
          <div
            key={c.key}
            className={cn(
              "flex items-center justify-between rounded-md border border-border px-3 py-2",
              !present && "opacity-50",
            )}
          >
            <div>
              <p className="text-xs font-medium text-foreground">{c.label}</p>
              <p className="mono-num text-[11px] text-muted-foreground">
                {c.key} · {present ? c.unit : "not in dataset"}
              </p>
            </div>
            <Switch
              checked={active}
              disabled={!present}
              onCheckedChange={() => toggleChannel(c.key)}
              aria-label={`Toggle ${c.label}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 0.05,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        className="mono-num h-9 text-xs"
        value={value}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AdvancedSettings() {
  return <AdvancedSettingsBody />;
}

export function NoiseControl() {
  const { cfg, setCfg } = usePmu();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Slider
          value={[cfg.noisePct]}
          min={0}
          max={20}
          step={0.5}
          onValueChange={([v]) => setCfg({ noisePct: v ?? 0 })}
        />
        <span className="mono-num w-20 text-xs text-muted-foreground">{cfg.noisePct.toFixed(1)} %</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 5, 10].map((n) => (
          <Button
            key={n}
            size="sm"
            variant={cfg.noisePct === n ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setCfg({ noisePct: n })}
          >
            {n}%
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Noise standard deviation is a percentage of each channel's own standard deviation over the record, added
        independently per sample with a fixed seed so results are reproducible.
      </p>
    </div>
  );
}

function AdvancedSettingsBody() {
  const { cfg, setCfg } = usePmu();
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumField label="MC dropout passes K" value={cfg.K} step={1} min={2} max={200} onChange={(K) => setCfg({ K: Math.round(K) })} />
        <NumField label="Dropout rate" value={cfg.dropout} step={0.05} min={0} max={0.8} onChange={(dropout) => setCfg({ dropout })} />
        <NumField label="Random seed" value={cfg.seed} step={1} onChange={(seed) => setCfg({ seed: Math.round(seed) })} />
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Nominal frequency f₀</Label>
          <Select
            value={String(cfg.nominalFrequency)}
            onValueChange={(v) => setCfg({ nominalFrequency: Number(v) === 60 ? 60 : 50 })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 Hz</SelectItem>
              <SelectItem value="60">60 Hz</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Set per dataset; never assumed.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumField label="α (uncertainty weight)" value={cfg.alpha} onChange={(alpha) => setCfg({ alpha })} hint="Demo default 1.0" />
        <NumField label="β (physics weight)" value={cfg.beta} onChange={(beta) => setCfg({ beta })} hint="Demo default 1.0" />
        <NumField label="U₀ (uncertainty scale)" value={cfg.U0} step={0.005} onChange={(U0) => setCfg({ U0: Math.max(1e-5, U0) })} hint="Select from validation data" />
        <NumField label="R₀ (residual scale, rad/s)" value={cfg.R0} step={0.1} onChange={(R0) => setCfg({ R0: Math.max(1e-5, R0) })} hint="Select from validation data" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumField label="τs (stable prob. threshold)" value={cfg.tauS} min={0} max={1} onChange={(tauS) => setCfg({ tauS })} />
        <NumField label="τu (unstable prob. threshold)" value={cfg.tauU} min={0} max={1} onChange={(tauU) => setCfg({ tauU })} />
        <NumField label="τr (min. reliability)" value={cfg.tauR} min={0} max={1} onChange={(tauR) => setCfg({ tauR })} />
      </div>
      <p className="text-xs text-muted-foreground">
        All thresholds and scaling constants are configurable placeholders. They must be selected on a validation split
        of a labelled dataset before any performance claim is made; they are not universal constants.
      </p>
    </div>
  );
}

export function maskLabel(masked: ChannelKey[]) {
  return masked.length === 0 ? "none" : masked.join(", ");
}