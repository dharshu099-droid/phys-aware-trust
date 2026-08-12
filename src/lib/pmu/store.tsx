import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEMO_EVENTS } from "./dataLoader";
import { prepare, runInference, type InferenceResult } from "./inference";
import type { PreprocessResult } from "./preprocessing";
import { DEFAULT_CONFIG, type ChannelKey, type PipelineConfig, type PmuEvent } from "./types";

interface Ctx {
  events: PmuEvent[];
  addEvent: (e: PmuEvent) => void;
  updateEvent: (id: string, patch: Partial<PmuEvent>) => void;
  eventId: string;
  setEventId: (id: string) => void;
  event: PmuEvent;
  pre: PreprocessResult;
  cfg: PipelineConfig;
  setCfg: (patch: Partial<PipelineConfig>) => void;
  toggleChannel: (c: ChannelKey) => void;
  result: InferenceResult;
}

const PmuContext = createContext<Ctx | null>(null);

export function PmuProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<PmuEvent[]>(DEMO_EVENTS);
  const [eventId, setEventId] = useState(DEMO_EVENTS[0]!.id);
  const [cfg, setCfgState] = useState<PipelineConfig>({
    ...DEFAULT_CONFIG,
    nominalFrequency: DEMO_EVENTS[0]!.nominalFrequency,
  });

  const event = events.find((e) => e.id === eventId) ?? events[0]!;
  const pre = useMemo(() => prepare(event), [event]);
  const result = useMemo(() => runInference(pre, cfg), [pre, cfg]);

  const value: Ctx = {
    events,
    addEvent: (e) => {
      setEvents((prev) => [...prev, e]);
      setEventId(e.id);
      setCfgState((c) => ({ ...c, nominalFrequency: e.nominalFrequency, maskedChannels: [] }));
    },
    updateEvent: (id, patch) => setEvents((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item)),
    eventId,
    setEventId: (id) => {
      setEventId(id);
      const next = events.find((e) => e.id === id);
      if (next) setCfgState((c) => ({ ...c, nominalFrequency: next.nominalFrequency, maskedChannels: [] }));
    },
    event,
    pre,
    cfg,
    setCfg: (patch) => setCfgState((c) => ({ ...c, ...patch })),
    toggleChannel: (ch) =>
      setCfgState((c) => ({
        ...c,
        maskedChannels: c.maskedChannels.includes(ch)
          ? c.maskedChannels.filter((x) => x !== ch)
          : [...c.maskedChannels, ch],
      })),
    result,
  };

  return <PmuContext.Provider value={value}>{children}</PmuContext.Provider>;
}

export function usePmu() {
  const ctx = useContext(PmuContext);
  if (!ctx) throw new Error("usePmu must be used inside PmuProvider");
  return ctx;
}
