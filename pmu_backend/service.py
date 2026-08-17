from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, TensorDataset

from .model import EvidentialCfC, evidential_loss
from .preprocessing import WINDOWS_MS, PreparedEvent, physics_residual


ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "cfc_evidential"


@dataclass
class Runtime:
    model: EvidentialCfC
    scaler: StandardScaler
    metadata: dict[str, Any]


def model_status() -> dict[str, Any]:
    metadata_path = ARTIFACT_DIR / "metadata.json"
    if not metadata_path.exists():
        return {"status": "UNTRAINED", "reason": "No labelled Stable/Unstable training artifact exists."}
    metadata = json.loads(metadata_path.read_text())
    return {"status": "READY" if metadata.get("calibration") else "TRAINED_UNCALIBRATED", **metadata}


def load_runtime() -> Runtime:
    status = model_status()
    if status["status"] == "UNTRAINED":
        raise ValueError(status["reason"])
    scaler = joblib.load(ARTIFACT_DIR / "scaler.joblib")
    checkpoint = torch.load(ARTIFACT_DIR / "model.pt", map_location="cpu", weights_only=True)
    model = EvidentialCfC(checkpoint["input_size"], checkpoint["hidden_size"])
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    return Runtime(model, scaler, status)


def _validate_training_events(events: list[PreparedEvent]) -> list[PreparedEvent]:
    unique: dict[str, PreparedEvent] = {}
    for event in events:
        unique.setdefault(event.sha256, event)
    items = list(unique.values())
    if any(event.label is None for event in items):
        raise ValueError("Training refused: every unique PMU event requires an explicit Stable/Unstable label column.")
    labels = {event.label for event in items}
    if labels != {0, 1}:
        raise ValueError("Training refused: labelled events from both Stable and Unstable classes are required.")
    if len(items) < 4:
        raise ValueError("Training refused: at least four unique labelled event files are required for this prototype.")
    names = {tuple(event.feature_names) for event in items}
    if len(names) != 1:
        raise ValueError("All training events must resolve to the same detected feature set.")
    return items


def _matrix(events: list[PreparedEvent], window_ms: int, scaler: StandardScaler | None = None) -> tuple[np.ndarray, np.ndarray, StandardScaler]:
    sequences = [event.window(window_ms)[0] for event in events]
    length = min(len(sequence) for sequence in sequences)
    sequences = [sequence[:length] for sequence in sequences]
    stacked = np.stack(sequences).astype(np.float32)
    target = np.asarray([event.label for event in events], dtype=np.int64)
    scaler = scaler or StandardScaler().fit(stacked.reshape(-1, stacked.shape[-1]))
    scaled = scaler.transform(stacked.reshape(-1, stacked.shape[-1])).reshape(stacked.shape).astype(np.float32)
    return scaled, target, scaler


def train(events: list[PreparedEvent], window_ms: int = 200, epochs: int = 40, seed: int = 42) -> dict[str, Any]:
    items = _validate_training_events(events)
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    x, y, scaler = _matrix(items, window_ms)
    model = EvidentialCfC(x.shape[-1])
    optimizer = torch.optim.AdamW(model.parameters(), lr=8e-4, weight_decay=1e-4)
    loader = DataLoader(TensorDataset(torch.from_numpy(x), torch.from_numpy(y)), batch_size=min(16, len(x)), shuffle=True)
    history: list[float] = []
    model.train()
    for epoch in range(epochs):
        losses = []
        for xb, yb in loader:
            evidence, _, _ = model(xb)
            loss = evidential_loss(evidence, yb, epoch, epochs)
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            losses.append(float(loss.detach()))
        history.append(float(np.mean(losses)))
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "input_size": x.shape[-1], "hidden_size": 48}, ARTIFACT_DIR / "model.pt")
    joblib.dump(scaler, ARTIFACT_DIR / "scaler.joblib")
    metadata = {
        "model": "EvidentialCfC",
        "feature_names": items[0].feature_names,
        "window_ms": window_ms,
        "unique_labelled_events": len(items),
        "class_counts": {"Stable": int((y == 0).sum()), "Unstable": int((y == 1).sum())},
        "epochs": epochs,
        "final_training_loss": history[-1],
        "calibration": None,
    }
    (ARTIFACT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2))
    return {"status": "TRAINED_UNCALIBRATED", **metadata}


def _model_output(runtime: Runtime, event: PreparedEvent, window_ms: int) -> dict[str, Any]:
    if event.feature_names != runtime.metadata["feature_names"]:
        raise ValueError(f"Detected feature set {event.feature_names} does not match trained features {runtime.metadata['feature_names']}.")
    sequence, _, _, _ = event.window(window_ms)
    scaled = runtime.scaler.transform(sequence).astype(np.float32)
    with torch.no_grad():
        evidence, probability, uncertainty = runtime.model(torch.from_numpy(scaled[None]))
    return {
        "evidence": evidence[0].numpy().tolist(),
        "P_stable": float(probability[0, 0]),
        "P_unstable": float(probability[0, 1]),
        "U_evi": float(uncertainty[0]),
    }


def predict(event: PreparedEvent, nominal_frequency: float, window_ms: int) -> dict[str, Any]:
    physics = physics_residual(event, nominal_frequency, window_ms)
    status = model_status()
    base = {"model_status": status["status"], "window_ms": window_ms, "samples": len(event.window(window_ms)[0]), "physics": physics}
    if status["status"] == "UNTRAINED":
        return {**base, "P_stable": None, "P_unstable": None, "U_evi": None, "evidence": None, "R_phy_norm": None, "S_rel": None, "decision": "Uncertain", "reason": status["reason"]}
    runtime = load_runtime()
    output = _model_output(runtime, event, window_ms)
    calibration = runtime.metadata.get("calibration")
    if not calibration:
        return {**base, **output, "R_phy_norm": None, "S_rel": None, "decision": "Uncertain", "reason": "Reliability parameters have not been calibrated on validation data."}
    rphy = physics["R_phy"]
    rnorm = None if rphy is None else float(rphy / (rphy + calibration["R0"]))
    confidence = 2 * abs(output["P_unstable"] - 0.5)
    score = confidence * np.exp(-calibration["alpha_rel"] * output["U_evi"] - calibration["beta_rel"] * (rnorm or 0.0))
    if output["P_unstable"] <= calibration["tau_stable"] and score >= calibration["tau_reliability"]:
        decision = "Stable"
    elif output["P_unstable"] >= calibration["tau_unstable"] and score >= calibration["tau_reliability"]:
        decision = "Unstable"
    else:
        decision = "Uncertain"
    return {**base, **output, "R_phy_norm": rnorm, "S_rel": float(score), "decision": decision, "calibration": calibration}


def calibrate(events: list[PreparedEvent], nominal_frequency: float) -> dict[str, Any]:
    items = _validate_training_events(events)
    runtime = load_runtime()
    if runtime.metadata["status"] == "UNTRAINED":
        raise ValueError("Train the model before calibration.")
    outputs = [_model_output(runtime, event, runtime.metadata["window_ms"]) for event in items]
    residuals = [physics_residual(event, nominal_frequency, runtime.metadata["window_ms"])["R_phy"] for event in items]
    valid = [value for value in residuals if value is not None and np.isfinite(value) and value > 0]
    if not valid:
        raise ValueError("Calibration requires voltage phase angle and frequency in the validation events.")
    r0 = float(np.median(valid))
    best: tuple[float, dict[str, float]] | None = None
    labels = np.asarray([event.label for event in items])
    for alpha in (0.25, 0.5, 1.0, 2.0):
        for beta in (0.25, 0.5, 1.0, 2.0):
            for tau_s in (0.25, 0.30, 0.35, 0.40):
                for tau_u in (0.60, 0.65, 0.70, 0.75):
                    for tau_r in (0.2, 0.3, 0.4, 0.5, 0.6):
                        decisions = []
                        for output, residual in zip(outputs, residuals):
                            rnorm = 0 if residual is None else residual / (residual + r0)
                            score = 2 * abs(output["P_unstable"] - 0.5) * np.exp(-alpha * output["U_evi"] - beta * rnorm)
                            decisions.append(0 if output["P_unstable"] <= tau_s and score >= tau_r else 1 if output["P_unstable"] >= tau_u and score >= tau_r else -1)
                        decisions = np.asarray(decisions)
                        covered = decisions >= 0
                        correct = int(np.sum(decisions[covered] == labels[covered]))
                        wrong = int(np.sum(decisions[covered] != labels[covered]))
                        objective = correct - 2 * wrong + 0.05 * int(covered.sum())
                        params = {"R0": r0, "alpha_rel": alpha, "beta_rel": beta, "tau_stable": tau_s, "tau_unstable": tau_u, "tau_reliability": tau_r}
                        if best is None or objective > best[0]: best = (objective, params)
    metadata_path = ARTIFACT_DIR / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["calibration"] = best[1]
    metadata["calibration_events"] = len(items)
    metadata_path.write_text(json.dumps(metadata, indent=2))
    return {"status": "READY", "calibration": best[1], "validation_events": len(items)}


def evaluate(events: list[PreparedEvent], nominal_frequency: float) -> dict[str, Any]:
    items = _validate_training_events(events)
    if model_status()["status"] != "READY":
        raise ValueError("Evaluation requires a trained and calibrated model.")
    result: dict[str, Any] = {}
    labels = np.asarray([event.label for event in items])
    for window in WINDOWS_MS:
        outputs = [predict(event, nominal_frequency, window) for event in items]
        decisions = np.asarray([0 if out["decision"] == "Stable" else 1 if out["decision"] == "Unstable" else -1 for out in outputs])
        covered = decisions >= 0
        if not covered.any():
            metrics = {"coverage": 0.0, "accuracy": None, "precision": None, "recall": None, "f1": None, "confusion_matrix": None}
        else:
            actual, predicted = labels[covered], decisions[covered]
            metrics = {
                "coverage": float(covered.mean()),
                "accuracy": float(accuracy_score(actual, predicted)),
                "precision": float(precision_score(actual, predicted, zero_division=0)),
                "recall": float(recall_score(actual, predicted, zero_division=0)),
                "f1": float(f1_score(actual, predicted, zero_division=0)),
                "confusion_matrix": confusion_matrix(actual, predicted, labels=[0, 1]).tolist(),
            }
        result[str(window)] = metrics
    return {"events": len(items), "windows": result}
