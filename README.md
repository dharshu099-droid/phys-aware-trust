# Physics-Calibrated Evidential CfC

The existing React frontend is connected to a FastAPI + PyTorch + `ncps` backend for PMU transient-stability research. The backend is dataset-agnostic, calculates the phase-frequency physics residual independently, and refuses to create classifier outputs when labelled training or calibration data is unavailable.

## Run locally

```powershell
python -m pip install -r requirements.txt
python -m uvicorn pmu_backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
npm install
npm run dev
```

Open the PMU Event Data page, confirm the Python backend URL, and upload a CSV. API documentation is available at `http://127.0.0.1:8000/docs`.

Backend endpoints:

- `POST /dataset/inspect`
- `POST /physics-residual`
- `POST /train`
- `POST /calibrate`
- `POST /predict` and `/predict/windows`
- `POST /evaluate`
- `POST /stream/emulate`

Training requires unique event files with an explicit event-level `Stable`/`Unstable` or `0`/`1` label column and both classes. Labels are never inferred from filenames. Without a trained model the API returns `UNTRAINED`, omits probabilities, and still returns inspection and `R_phy`.

## Original frontend brief

Build a complete interactive research prototype titled:

Physics-Calibrated Uncertainty-Aware Transformer for Reliable Early Power-System Stability Assessment

The application should demonstrate the complete workflow from real PMU measurements to Stable / Unstable / Uncertain output.

The system is intended as a research demonstration for power-grid operator decision support. Do not present the application as an actual certified grid protection system.

1. Main Research Flow

Implement the following architecture:

Real PMU Event Data → Preprocessing → Observation Window Selection → PMU Sequence Representation → Transformer Encoder → Stability Prediction + MC Dropout Uncertainty + PMU Physics Consistency → Physics-Calibrated Reliability Score → Stable / Unstable / Uncertain → Control-Center Decision Support

The interface must visually show this complete flow.

2. Dataset Input

Create a PMU dataset module based on the structure of the Transmission Signature Library (TSL).

Allow:

CSV upload

built-in demonstration event

multiple PMU event selection

event metadata display

Expected measurements when available:

Voltage magnitude (V)

Voltage phase angle (\theta)

Frequency (f)

Current (I)

Active power (P)

Reactive power (Q)

Do not claim that fabricated demo measurements are genuine TSL records.

If a real CSV is not supplied, clearly label built-in values:

“Illustrative Demo PMU Event”

Never label synthetic demo values as real field measurements.

3. PMU Event Dashboard

Create an initial dashboard showing:

Selected Event

Event ID

timestamp

available PMU channels

number of samples

sampling interval

Show time-series charts for:

Voltage

Frequency

Phase angle

Active power

Reactive power

The user should be able to move through the disturbance timeline.

Mark the approximate disturbance/event point on the graphs.

4. Preprocessing Module

Show preprocessing as visible stages:

Time synchronization

Missing-value detection

Cleaning

Normalization

Observation-window extraction

Display a status indicator for every stage.

Example:

Synchronization — Completed
Missing values — 2 detected
Normalization — Completed

Also provide:

Raw Data / Processed Data

tabs for comparison.

5. Early Observation Window Selection

Provide buttons or a slider for:

100 ms

200 ms

300 ms

500 ms

When the user changes the observation window, highlight that portion of the PMU waveform.

Example:

Selected Window: 200 ms

Only the selected early sequence should be passed to the AI pipeline.

Show:

[
X=[x_1,x_2,\ldots,x_T]
]

with

[
x_t=[V_t,\theta_t,f_t,P_t,Q_t]^T
]

when the corresponding channels are available.

6. Transformer AI Module

Implement a PyTorch Transformer Encoder for multivariate PMU time-series analysis.

Suggested prototype architecture:

input projection

positional encoding

2 Transformer Encoder layers

4 attention heads

hidden dimension approximately 64

dropout approximately 0.2

temporal pooling

binary classification head

Visually show:

PMU Sequence → Input Projection → Positional Encoding → Multi-Head Self-Attention → Temporal Representation → Stability Prediction

Display the self-attention equation in an expandable Method Details panel:

[
\mathrm{Attention}(Q,K,V)

\mathrm{softmax}
\left(
\frac{QK^T}{\sqrt{d_k}}
\right)V
]

Do not show random attention heatmaps as experimental evidence unless they are actually obtained from the running model.

7. Stability Prediction Head

The Transformer should output an instability probability:

[
p=P(\mathrm{Unstable}\mid X)
]

Display it visually as:

Instability Probability: 0.91

Include a probability gauge.

Interpretation:

probability near 0 → more stable

probability near 1 → more unstable

probability close to 0.5 → ambiguous

Do not make the final decision from this value alone.

8. MC Dropout Uncertainty Module

Implement predictive uncertainty using Monte Carlo Dropout.

During inference:

retain dropout

perform (K) stochastic forward passes

default (K=30)

allow changing (K) in an advanced settings panel

For predictions

[
p_1,p_2,\ldots,p_K
]

calculate:

[
\bar p=
\frac{1}{K}
\sum_{k=1}^{K}p_k
]

and

[
U=
\frac{1}{K}
\sum_{k=1}^{K}
(p_k-\bar p)^2
]

Display:

Mean Instability Probability

Predictive Uncertainty

Also provide a small chart showing the distribution of the stochastic predictions.

Example:

Run 1 — 0.89
Run 2 — 0.92
Run 3 — 0.90
...
Run 30 — 0.91

Low spread = lower uncertainty.

High spread = higher uncertainty.

9. PMU Physics-Consistency Module

Use the PMU phase-angle and frequency relationship:

[
\frac{d\theta}{dt}
\approx
2\pi(f-f_0)
]

Use the correct nominal frequency according to the data configuration.

Allow:

Nominal Frequency: 50 Hz / 60 Hz

Do not hardcode 50 Hz for all datasets.

For discrete samples compute:

[
\dot{\theta}(t)
\approx
\frac{\theta(t+\Delta t)-\theta(t)}
{\Delta t}
]

and the residual:

[
r(t)

\dot{\theta}(t)

2\pi(f(t)-f_0)
]

Aggregate it using:

[
R_{\mathrm{phy}}

\sqrt{
\frac{1}{T}
\sum_{t=1}^{T}r^2(t)
}
]

If the angle values are supplied in degrees, convert them to radians before calculating the residual.

Display:

Physics Residual: (R_{\mathrm{phy}})

and classify only for visualization:

Low physical deviation

Moderate physical deviation

High physical deviation

Thresholds must be configured from validation data rather than presented as universal constants.

Include a small graph:

Observed Phase-Rate vs Frequency-Implied Phase-Rate

10. Normalize Reliability Variables

Normalize predictive uncertainty and physics residual before using them in the reliability equation.

For demonstration, support:

[
\widetilde U=
\frac{U}{U+U_0}
]

and

[
\widetilde R_{\mathrm{phy}}

\frac{R_{\mathrm{phy}}}
{R_{\mathrm{phy}}+R_0}
]

Clearly state that (U_0) and (R_0) should be selected from validation data.

11. Classification Confidence

Calculate:

[
C=
2|\bar p-0.5|
]

Display:

Base Model Confidence

Explain in a tooltip:

“Measures how far the mean prediction lies from the binary decision boundary.”

12. Physics-Calibrated Reliability Algorithm

Implement the central contribution:

[
S_{\mathrm{rel}}

C
\exp
\left(
-\alpha\widetilde U
-\beta\widetilde R_{\mathrm{phy}}
\right)
]

Use configurable:

(\alpha)

(\beta)

Default both to 1.0 only for demonstration.

Display all components:

Base Confidence
Predictive Uncertainty
Physics Residual
Final Reliability Score

Show visually how each component contributes to the result.

Example:

Base confidence: 0.84
Normalized uncertainty: 0.08
Normalized physics residual: 0.11
Reliability score: 0.70

13. Final Decision Algorithm

Implement three possible outcomes.

Use configurable validation-derived thresholds:

stable probability threshold (\tau_s)

unstable probability threshold (\tau_u)

minimum reliability threshold (\tau_r)

Decision:

[
\hat y=
\begin{cases}
\mathrm{Stable},
&
\bar p\leq\tau_s
\text{ and }
S_{\mathrm{rel}}\geq\tau_r
\
\mathrm{Unstable},
&
\bar p\geq\tau_u
\text{ and }
S_{\mathrm{rel}}\geq\tau_r
\
\mathrm{Uncertain},
&
\mathrm{otherwise}
\end{cases}
]

Make the final output visually prominent:

STABLE

Reliable early stability assessment.

or

UNSTABLE

Potential instability detected with sufficient reliability.

or

UNCERTAIN

Prediction reliability is insufficient. Continue observation or request additional measurements.

Do not automatically recommend grid switching or load shedding as an autonomous action.

14. Why the Model Made This Decision

Create a section titled:

Reliability Explanation

Example:

Transformer
Instability probability = 91%

MC Dropout
Predictive uncertainty = Low

PMU Physics
Phase-frequency residual = Low

Reliability
Physics-calibrated reliability = High

Decision
Unstable

Then generate a simple explanation:

“The model identified an early disturbance pattern associated with instability. Repeated stochastic predictions remained consistent and the measured phase-frequency behaviour showed low physical deviation. The resulting prediction therefore exceeded the configured reliability threshold.”

For an uncertain case:

“The classification probability was high, but stochastic disagreement and/or physical inconsistency reduced the reliability score. The event has therefore been retained as uncertain rather than forcing a binary decision.”

15. Noise Robustness Demo

Provide a dedicated Stress Test tab.

Allow:

Noise Level

0%

1%

2%

5%

Model noisy measurements as:

[
X_{\mathrm{noise}}

X+\epsilon
]

with

[
\epsilon\sim\mathcal{N}(0,\sigma^2)
]

Show comparison:

MetricOriginalDegradedInstability probabilityvaluevalueUncertaintyvaluevaluePhysics residualvaluevalueReliabilityvaluevalue

Do not force the degraded result to become worse. Display whatever the actual model produces.

16. Missing PMU Channel Demo

Allow the user to disable individual channels:

Voltage

Phase angle

Frequency

Current

Active power

Reactive power

Represent masking as:

[
X_{\mathrm{mask}}

M\odot X
]

The interface should immediately rerun inference and display the new:

probability

uncertainty

physics residual where computable

reliability

If phase angle or frequency is missing, clearly display:

“PMU physics-consistency calculation unavailable for this observation.”

Do not fabricate a physics residual when the required channels are absent.

17. Observation-Window Comparison

Create a page called:

Early Prediction Analysis

Run the same event at:

100 ms
200 ms
300 ms
500 ms

Display a table:

WindowProbabilityUncertaintyPhysics ResidualReliabilityDecision100 ms...............200 ms...............300 ms...............500 ms...............

Add graphs for:

Observation Window vs Instability Probability

Observation Window vs Predictive Uncertainty

Observation Window vs Reliability Score

The purpose is to demonstrate the tradeoff between:

Earlier prediction and available evidence.

18. Model Comparison Page

Add a research comparison view containing:

Logistic Regression

LSTM

GRU

Vanilla Transformer

Proposed Physics-Calibrated Uncertainty-Aware Transformer

Only populate numerical results if real training/evaluation has been performed.

Otherwise display:

“Experimental result pending.”

Never invent accuracy values.

19. Evaluation Metrics

When ground-truth labels are available, calculate:

Accuracy

Precision

Recall

F1-score

False Negative Rate

Brier Score

inference latency

uncertain/abstention rate

Provide confusion matrix and calibration plot.

Do not calculate classification metrics when valid ground-truth labels are unavailable.

20. Main Demo Scenario

Include one illustrative scenario clearly labelled:

Illustrative Demo Scenario

Example:

A disturbance is observed from multiple PMU locations.

At 200 ms:

Mean instability probability = 0.91
Predictive uncertainty = 0.06
Normalized physics residual = 0.08
Reliability score = 0.77

Final output:

UNSTABLE — RELIABLE

Then allow the user to add noise or remove a channel.

A second run may produce, for example:

Mean instability probability = high
Predictive uncertainty = increased
Physics residual = increased
Reliability = below threshold

Final output:

UNCERTAIN

These values must either be generated transparently as illustrative demo values or obtained from the running model. Never present illustrative values as experimentally measured research results.

21. Architecture Visualization Page

Create an interactive architecture diagram:

Real PMU Event Data

↓

Preprocessing & Window Selection

↓

PMU Sequence Representation

↓

Transformer Encoder

then branch into:

Stability Prediction Head

MC Dropout Uncertainty Estimation

PMU-Based Physics Consistency

then merge into:

Physics-Calibrated Reliability Assessment

↓

Stable / Unstable / Uncertain

↓

Utility Control Center / Wide-Area Monitoring / Operator Decision Support

Clicking each block should display its equation and explanation.

22. User Interface

Use a professional research-dashboard appearance.

Pages:

Overview

PMU Event Data

Early Prediction

AI Model

Uncertainty

Physics Consistency

Reliability Assessment

Stress Testing

Evaluation

Architecture

Main dashboard cards:

Instability Probability

Predictive Uncertainty

Physics Residual

Reliability Score

Final Decision

Avoid futuristic AI visuals.

Use a clean scientific dashboard appropriate for an IEEE research demonstration.

23. Technology Stack

Preferred implementation:

Frontend
React + Vite

Backend
FastAPI

AI
Python + PyTorch

Data Processing
Pandas + NumPy

Evaluation
scikit-learn

Charts
Plotly or Recharts

Structure the backend into:

data_loader.py

preprocessing.py

transformer_model.py

uncertainty.py

physics.py

reliability.py

inference.py

evaluation.py

api.py

24. API Design

Implement:

POST /api/event/upload

Upload PMU CSV.

GET /api/event/{id}

Retrieve processed event information.

POST /api/predict

Input:

event

observation window

Output:

mean probability

uncertainty

physics residual

reliability

decision

POST /api/stress-test

Input:

event

window

noise level

masked channels

Output original and degraded predictions.

GET /api/window-analysis/{event_id}

Return 100/200/300/500 ms comparison.

25. Research Integrity Requirements

Do not fabricate:

experimental accuracy

PMU events

stable/unstable ground truth

calibration metrics

comparisons with existing models

real-time grid deployment claims

Clearly distinguish:

Real dataset

from

Illustrative software demo

from

Measured experimental results

If valid stability labels are not available, display:

“Ground-truth transient-stability labels require a defined labeling protocol before supervised evaluation.”

The demo should still show preprocessing, Transformer inference architecture, uncertainty calculations, physics consistency, and reliability logic without falsely claiming validated TSA performance.

Final Demo Goal

A reviewer should be able to upload or select a PMU event and visually follow:

What measurements entered the system → what the Transformer predicted → how uncertain the AI was → whether the measurements were physically consistent → how the reliability score was calculated → why the final result became Stable, Unstable, or Uncertain.

The central research message of the application must remain:

A high AI probability is not automatically treated as trustworthy. The proposed framework calibrates an early Transformer prediction using both predictive uncertainty and PMU-derived physical consistency before accepting the stability decision.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://phys-aware-trust.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/862d83cd-f610-41b4-a82d-235fb8da7faf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
