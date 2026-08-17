import { createFileRoute } from "@tanstack/react-router";
import { usePmu } from "@/lib/pmu/store";
import { ProbabilityGauge } from "@/components/pmu/charts";
import { Formula, KeyValue, MetricCard, ModelStatusNotice, PageHeader, SectionCard, fmt } from "@/components/pmu/ui";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/ai-model")({
  head: () => ({
    meta: [
      { title: "Evidential CfC — AI Model Details" },
      {
        name: "description",
        content:
          "PyTorch ncps CfC temporal model with a two-class evidential output head for multivariate PMU sequences.",
      },
      { property: "og:title", content: "Evidential CfC — AI Model Details" },
      {
        property: "og:description",
        content: "Inspect the CfC temporal stages, class evidence, probabilities and evidential uncertainty.",
      },
    ],
  }),
  component: ModelPage,
});

const STAGES = [
  { name: "PMU sequence", detail: "X ∈ ℝ^{T×C} after windowing and z-scoring" },
  { name: "CfC temporal dynamics", detail: "Closed-form continuous-time recurrent state update" },
  { name: "Temporal representation", detail: "Final CfC hidden state h_T ∈ ℝ^48" },
  { name: "Evidential head", detail: "Softplus evidence e = [e_stable, e_unstable] ≥ 0" },
  { name: "Dirichlet parameters", detail: "α_k = e_k + 1; p_k = α_k / Σα" },
  { name: "Evidential uncertainty", detail: "U_evi = 2 / Σα" },
];

function ModelPage() {
  const { result, event, cfg } = usePmu();
  const backend = event.backendAnalysis?.windows[String(cfg.windowMs)];
  return (
    <>
      <PageHeader
        eyebrow="AI model"
        title="Evidential CfC for Multivariate PMU Sequences"
        description="The Python backend passes the detected and normalised PMU sequence through a Closed-form Continuous-time model and an evidential output head. Probabilities are shown only when a valid labelled model has been trained."
      />
      <ModelStatusNotice status={result.modelStatus} reason={result.statusReason} />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <SectionCard title="Forward path" subtitle="Normalised PMU sequence → CfC state dynamics → evidential output">
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
            {result.modelOutputAvailable ? <ProbabilityGauge p={result.unc.pbar} /> : <p className="py-12 text-center text-3xl font-semibold text-muted-foreground">N/A</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              P(Stable) = {fmt(result.modelOutputAvailable ? 1 - result.unc.pbar : null)} · P(Unstable) = {fmt(result.modelOutputAvailable ? result.unc.pbar : null)} · U_evi = {fmt(result.modelOutputAvailable ? result.unc.U : null)}.
            </p>
          </SectionCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Sequence samples T" value={`${result.seq.T}`} footer="selected observation window" />
            <MetricCard label="Input channels C" value={`${result.seq.channels.length}`} footer={result.seq.channels.join(", ") || "none"} />
          </div>
        </div>
      </div>

      <SectionCard title="Class evidence" subtitle="Non-negative evidence returned by the Python evidential head.">
        <KeyValue items={[{ k: "Stable evidence", v: fmt(backend?.evidence?.[0]) }, { k: "Unstable evidence", v: fmt(backend?.evidence?.[1]) }]} />
      </SectionCard>

      <SectionCard title="Method details" subtitle="Expand for the formal definitions used in the implementation.">
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="attn">
            <AccordionTrigger className="text-sm">Evidential output equations</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <Formula label="Evidence is non-negative and defines a two-class Dirichlet distribution.">
                e_k = softplus(z_k),&nbsp;&nbsp;α_k = e_k + 1
              </Formula>
              <Formula label="Class probabilities and total evidential uncertainty.">
                p_k = α_k / Σ_j α_j,&nbsp;&nbsp;U_evi = 2 / Σ_j α_j
              </Formula>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="pe">
            <AccordionTrigger className="text-sm">CfC temporal representation</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm text-muted-foreground">The ncps CfC layer evolves a continuous-time hidden state over the PMU samples. The final hidden state is passed to the evidential head; the frontend does not manufacture or approximate this state.</p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="arch">
            <AccordionTrigger className="text-sm">Prototype hyper-parameters</AccordionTrigger>
            <AccordionContent>
              <KeyValue
                items={[
                  { k: "Runtime", v: "Python / PyTorch / ncps" },
                  { k: "Temporal layer", v: "CfC" },
                  { k: "Hidden dimension", v: "48" },
                  { k: "Head", v: "LayerNorm → Linear(2) → Softplus" },
                  { k: "Output", v: "Dirichlet evidence, probabilities, U_evi" },
                  { k: "Model status", v: result.modelStatus },
                ]}
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="backend">
            <AccordionTrigger className="text-sm">Reference backend module layout</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                The active backend is FastAPI + PyTorch + ncps with modules{" "}
                <span className="mono-num">
                  pmu_backend/preprocessing.py, model.py, service.py, main.py
                </span>{" "}
                and endpoints for inspection, physics residual, training, calibration, prediction, evaluation and stream emulation.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SectionCard>
    </>
  );
}
