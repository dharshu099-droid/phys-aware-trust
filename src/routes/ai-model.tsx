import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { ARCH } from "@/lib/pmu/transformerModel";
import { ProbabilityGauge } from "@/components/pmu/charts";
import { DemoNotice, Formula, KeyValue, MetricCard, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/ai-model")({
  head: () => ({
    meta: [
      { title: "Transformer Encoder — AI Model Details" },
      {
        name: "description",
        content:
          "Prototype Transformer encoder for multivariate PMU sequences: input projection, positional encoding, multi-head self-attention, temporal pooling and the stability prediction head.",
      },
      { property: "og:title", content: "Transformer Encoder — AI Model Details" },
      {
        property: "og:description",
        content: "Inspect the encoder stages, the attention definition and the instability probability head.",
      },
    ],
  }),
  component: ModelPage,
});

const STAGES = [
  { name: "PMU sequence", detail: "X ∈ ℝ^{T×C} after windowing and z-scoring" },
  { name: "Input projection", detail: "Linear C → d_model = 64" },
  { name: "Positional encoding", detail: "Sinusoidal, added to the projected tokens" },
  { name: "Multi-head self-attention", detail: "2 encoder layers × 4 heads (d_k = 16), residual + LayerNorm, dropout 0.2" },
  { name: "Feed-forward", detail: "64 → 128 → 64 with ReLU, residual + LayerNorm" },
  { name: "Temporal representation", detail: "Mean pooling over the token axis → h ∈ ℝ^64" },
  { name: "Stability prediction", detail: "Linear 64 → 1 with sigmoid → p = P(Unstable | X)" },
];

function AttentionMap({ attention }: { attention: number[][] }) {
  if (attention.length === 0) return <p className="text-sm text-muted-foreground">No attention map for this input.</p>;
  const max = Math.max(...attention.flat());
  return (
    <div className="space-y-2">
      <div
        className="grid gap-[1px]"
        style={{ gridTemplateColumns: `repeat(${attention.length}, minmax(0, 1fr))` }}
      >
        {attention.map((row, i) =>
          row.map((v, j) => (
            <div
              key={`${i}-${j}`}
              title={`query token ${i + 1} → key token ${j + 1}: ${v.toFixed(4)}`}
              className="aspect-square rounded-[1px]"
              style={{ backgroundColor: `color-mix(in oklab, var(--chart-1) ${(v / max) * 100}%, var(--secondary))` }}
            />
          )),
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Head-averaged attention weights of the final encoder layer, computed by the running model on the current
        observation window (deterministic pass, dropout disabled). Because the weights are untrained, this map shows what
        the architecture computes — it is not experimental evidence of learned physical behaviour.
      </p>
    </div>
  );
}

function ModelPage() {
  const { result, cfg } = usePmu();
  return (
    <>
      <PageHeader
        eyebrow="AI model"
        title="Transformer Encoder for Multivariate PMU Sequences"
        description="A compact encoder consumes the early PMU window and produces an instability probability. The reference implementation is a PyTorch TransformerEncoder; this demonstration runs a faithful in-browser reimplementation so every intermediate quantity shown is genuinely produced by the model you are looking at."
      />

      <DemoNotice>
        <strong>Untrained prototype.</strong> Weights are deterministically initialised from the configured seed (
        {cfg.seed}); no supervised training on labelled transient-stability data has been performed. The readout applies a
        documented heuristic calibration on top of the pooled embedding so the demo responds to waveform severity. No
        accuracy, detection-time or calibration claim can be derived from it.
      </DemoNotice>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <SectionCard title="Forward path" subtitle="PMU sequence → projection → positional encoding → self-attention → pooling → prediction">
          <ol className="space-y-2">
            {STAGES.map((s, i) => (
              <li key={s.name} className="rounded-md border border-border px-3 py-2">
                <p className="text-xs font-semibold text-foreground">
                  {i + 1}. {s.name}
                </p>
                <p className="mono-num text-[11px] text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ol>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Instability probability" subtitle="p = P(Unstable | X) for the current window">
            <ProbabilityGauge p={result.unc.pbar} />
            <p className="mt-2 text-xs text-muted-foreground">
              Deterministic pass (dropout off): p = {fmt(result.deterministicP)}. Mean over {cfg.K} MC dropout passes: p̄ ={" "}
              {fmt(result.unc.pbar)}. The decision is never taken from this value alone.
            </p>
          </SectionCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Tokens after pooling input" value={`${result.seq.T}`} footer={`capped at ${ARCH.maxTokens} tokens`} />
            <MetricCard label="Input channels C" value={`${result.seq.channels.length}`} footer={result.seq.channels.join(", ") || "none"} />
          </div>
        </div>
      </div>

      <SectionCard title="Self-attention map (running model)" subtitle="Query tokens on the vertical axis, key tokens on the horizontal axis.">
        <AttentionMap attention={result.attention} />
      </SectionCard>

      <SectionCard title="Method details" subtitle="Expand for the formal definitions used in the implementation.">
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="attn">
            <AccordionTrigger className="text-sm">Scaled dot-product attention</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <Formula label="Applied per head with d_k = d_model / h = 16, then concatenated and projected by W_O.">
                Attention(Q, K, V) = softmax( Q·Kᵀ / √d_k ) · V
              </Formula>
              <Formula label="Multi-head form.">
                MultiHead(X) = Concat(head₁, …, head_h)·W_O,&nbsp;&nbsp;head_i = Attention(X·W_Q^i, X·W_K^i, X·W_V^i)
              </Formula>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="pe">
            <AccordionTrigger className="text-sm">Positional encoding and pooling</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <Formula>
                PE(pos, 2i) = sin(pos / 10000^{"{"}2i/d{"}"}),&nbsp;&nbsp;PE(pos, 2i+1) = cos(pos / 10000^{"{"}2i/d{"}"})
              </Formula>
              <Formula label="Temporal mean pooling over the encoder output, followed by the binary head.">
                h = (1/T) Σ_t z_t,&nbsp;&nbsp;p = σ(wᵀh + b)
              </Formula>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="arch">
            <AccordionTrigger className="text-sm">Prototype hyper-parameters</AccordionTrigger>
            <AccordionContent>
              <KeyValue
                items={[
                  { k: "Encoder layers", v: `${ARCH.nLayers}` },
                  { k: "Attention heads", v: `${ARCH.nHeads}` },
                  { k: "Hidden dimension d_model", v: `${ARCH.dModel}` },
                  { k: "Feed-forward dimension", v: `${ARCH.dFF}` },
                  { k: "Dropout", v: `${cfg.dropout}` },
                  { k: "Pooling", v: "temporal mean" },
                  { k: "Head", v: "linear → sigmoid (binary)" },
                  { k: "Max tokens", v: `${ARCH.maxTokens} (window averaged if longer)` },
                ]}
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="backend">
            <AccordionTrigger className="text-sm">Reference backend module layout</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                The research reference stack is FastAPI + PyTorch with modules{" "}
                <span className="mono-num">
                  data_loader.py, preprocessing.py, transformer_model.py, uncertainty.py, physics.py, reliability.py,
                  inference.py, evaluation.py, api.py
                </span>{" "}
                and endpoints <span className="mono-num">POST /api/event/upload</span>,{" "}
                <span className="mono-num">GET /api/event/{"{"}id{"}"}</span>,{" "}
                <span className="mono-num">POST /api/predict</span>,{" "}
                <span className="mono-num">POST /api/stress-test</span>,{" "}
                <span className="mono-num">GET /api/window-analysis/{"{"}event_id{"}"}</span>.
              </p>
              <p>
                This deployment has no Python runtime, so each module is mirrored one-to-one in TypeScript (
                <span className="mono-num">
                  src/lib/pmu/dataLoader, preprocessing, transformerModel, uncertainty, physics, reliability, inference
                </span>
                ) and executed in the browser. The mathematics, staging and outputs are identical in structure; only the
                runtime differs.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SectionCard>
    </>
  );
}