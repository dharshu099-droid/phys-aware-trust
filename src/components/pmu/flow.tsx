import { cn } from "@/lib/utils";

export interface FlowBlock {
  id: string;
  title: string;
  equation?: string;
  detail: string;
  branch?: boolean;
}

export const FLOW: FlowBlock[] = [
  {
    id: "data",
    title: "Real PMU Event Data",
    detail:
      "Synchrophasor records: voltage magnitude, voltage phase angle, frequency, current, active and reactive power. Uploaded CSV records keep the provenance supplied by the user; built-in waveforms are labelled Illustrative Demo PMU Events.",
  },
  {
    id: "prep",
    title: "Preprocessing & Observation Window Selection",
    equation: "timestamps → gaps → deg→rad → unwrap → z-score → [t_e, t_e + W]",
    detail:
      "Uniform time synchronisation, missing-value detection and interpolation, per-channel standardisation, then extraction of the early observation window W ∈ {100, 200, 300, 500} ms after the disturbance onset.",
  },
  {
    id: "seq",
    title: "PMU Sequence Representation",
    equation: "X = [x₁, x₂, …, x_T],  x_t = [V_t, θ_t, f_t, P_t, Q_t]ᵀ",
    detail:
      "Only the channels actually present (and not masked) form the feature vector, so a missing channel reduces the input dimension rather than being imputed with fabricated values.",
  },
  {
    id: "encoder",
    title: "CfC Temporal Model",
    equation: "h_T = CfC(X, Δt)",
    detail: "The ncps Closed-form Continuous-time layer models the irregular temporal response and returns the final hidden state.",
  },
  {
    id: "head",
    title: "Evidential Output Head",
    equation: "e_k≥0, α_k=e_k+1, p_k=α_k/Σα",
    detail: "Returns Stable/Unstable class evidence and probabilities only from a valid trained artifact.",
    branch: true,
  },
  {
    id: "mc",
    title: "Evidential Uncertainty",
    equation: "U_evi = 2/Σα",
    detail: "Low Dirichlet strength produces high evidential uncertainty without repeated stochastic passes.",
    branch: true,
  },
  {
    id: "phy",
    title: "PMU Physics Consistency",
    equation: "r(t) = θ̇(t) − 2π(f(t) − f₀),  R_phy = √(mean r²)",
    detail:
      "Checks the measured phase-angle rate against the frequency-implied phase rate for the configured nominal frequency. Unavailable, never fabricated, when θ or f is absent.",
    branch: true,
  },
  {
    id: "rel",
    title: "Physics-Calibrated Reliability Assessment",
    equation: "S_rel = C·exp(−α_rel·U_evi − β_rel·R̃_phy),  C = 2|P_u − 0.5|",
    detail:
      "Central contribution: base model confidence is discounted by normalised predictive uncertainty and normalised physical inconsistency.",
  },
  {
    id: "decision",
    title: "Stable / Unstable / Uncertain",
    equation: "ŷ = Stable if P_u ≤ τs ∧ S_rel ≥ τr; Unstable if P_u ≥ τu ∧ S_rel ≥ τr; else Uncertain",
    detail: "A three-way outcome with explicit abstention instead of a forced binary decision.",
  },
  {
    id: "ops",
    title: "Control-Center Decision Support",
    detail:
      "Intended consumers: utility control centre displays, wide-area monitoring systems and operator situational awareness. The prototype issues no autonomous switching or load-shedding action.",
  },
];

export function FlowDiagram({
  selected,
  onSelect,
  compact = false,
}: {
  selected?: string;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const branch = FLOW.filter((b) => b.branch);
  const linear = FLOW.filter((b) => !b.branch);
  const before = linear.slice(0, 3);
  const encoder = linear[3]!;
  const after = linear.slice(4);

  const Block = ({ b }: { b: FlowBlock }) => (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(b.id) : undefined}
      className={cn(
        "w-full rounded-md border px-4 py-3 text-left transition-colors",
        selected === b.id
          ? "border-ring bg-accent/60"
          : "border-border bg-card hover:border-ring/60 hover:bg-secondary",
        !onSelect && "cursor-default",
      )}
    >
      <p className="text-xs font-semibold text-foreground">{b.title}</p>
      {b.equation && !compact ? (
        <p className="mono-num mt-1 text-[11px] leading-relaxed text-muted-foreground">{b.equation}</p>
      ) : null}
    </button>
  );

  const Arrow = () => <div className="mx-auto h-4 w-px bg-border" aria-hidden />;

  return (
    <div className="space-y-2">
      {before.map((b) => (
        <div key={b.id}>
          <Block b={b} />
          <Arrow />
        </div>
      ))}
      <Block b={encoder} />
      <Arrow />
      <div className="grid gap-2 md:grid-cols-3">
        {branch.map((b) => (
          <Block key={b.id} b={b} />
        ))}
      </div>
      <Arrow />
      {after.map((b, i) => (
        <div key={b.id}>
          <Block b={b} />
          {i < after.length - 1 ? <Arrow /> : null}
        </div>
      ))}
    </div>
  );
}
