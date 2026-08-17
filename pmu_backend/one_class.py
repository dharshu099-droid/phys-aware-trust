from __future__ import annotations

import json
import io
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "lbnl_one_class"


class CfCPredictor(nn.Module):
    def __init__(self, hidden_size: int = 24):
        super().__init__()
        from ncps.torch import CfC
        self.cfc = CfC(1, hidden_size, batch_first=True)
        self.head = nn.Linear(hidden_size, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        sequence, _ = self.cfc(x)
        return self.head(sequence)


def load_reference(path: Path, rows: int = 600_000) -> tuple[np.ndarray, np.ndarray]:
    frame = pd.read_csv(path, header=None, names=["timestamp_ns", "angle_deg"], nrows=rows)
    timestamp = pd.to_numeric(frame.timestamp_ns, errors="coerce").to_numpy(np.float64)
    angle = pd.to_numeric(frame.angle_deg, errors="coerce").interpolate(limit_direction="both").to_numpy(np.float64)
    if len(angle) < 10_000:
        raise ValueError("Reference needs at least 10,000 valid samples.")
    return timestamp, np.unwrap(np.deg2rad(angle))


def windows(values: np.ndarray, length: int = 25, stride: int = 25) -> np.ndarray:
    starts = np.arange(0, len(values) - length - 1, stride)
    return np.stack([values[start : start + length + 1] for start in starts]).astype(np.float32)


def train_reference(path: Path, epochs: int = 8, seed: int = 42) -> dict[str, Any]:
    torch.manual_seed(seed)
    timestamp, angle = load_reference(path)
    signal = np.diff(angle)
    timestamp = timestamp[1:]
    split1, split2 = int(len(signal) * .6), int(len(signal) * .8)
    mean, std = float(signal[:split1].mean()), max(float(signal[:split1].std()), 1e-8)
    normalized = (signal - mean) / std
    train_w = windows(normalized[:split1])
    calibration_w = windows(normalized[split1:split2])
    test_w = windows(normalized[split2:])
    model = CfCPredictor()
    loader = DataLoader(TensorDataset(torch.from_numpy(train_w[:, :-1, None]), torch.from_numpy(train_w[:, 1:, None])), batch_size=256, shuffle=True)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    for _ in range(epochs):
        for x, target in loader:
            optimizer.zero_grad()
            loss = torch.mean((model(x) - target) ** 2)
            loss.backward()
            optimizer.step()

    def scores(data: np.ndarray) -> np.ndarray:
        model.eval()
        with torch.no_grad():
            pred = model(torch.from_numpy(data[:, :-1, None]))
            return torch.sqrt(torch.mean((pred - torch.from_numpy(data[:, 1:, None])) ** 2, dim=(1, 2))).numpy()

    calibration_scores = scores(calibration_w)
    test_scores = scores(test_w)
    threshold = float(np.quantile(calibration_scores, .95))
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "hidden_size": 24}, ARTIFACT_DIR / "model.pt")
    np.save(ARTIFACT_DIR / "calibration_scores.npy", calibration_scores)
    metadata = {
        "status": "READY_ONE_CLASS",
        "reference": path.name,
        "reference_rows_used": len(signal) + 1,
        "sampling_interval_ms": float(np.median(np.diff(timestamp)) / 1e6),
        "representation": "unwrapped_phase_increment_rad", "mean": mean, "std": std, "window_samples": 25, "threshold_q95": threshold,
        "test_false_alarm_rate": float(np.mean(test_scores > threshold)),
        "output_classes": ["Normal", "Anomalous"],
        "warning": "Self-supervised one-class model; outputs are not transient-stability labels.",
    }
    (ARTIFACT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2))
    return metadata


def predict_angle(angle_deg: np.ndarray) -> dict[str, Any]:
    metadata = json.loads((ARTIFACT_DIR / "metadata.json").read_text())
    checkpoint = torch.load(ARTIFACT_DIR / "model.pt", map_location="cpu", weights_only=True)
    model = CfCPredictor(checkpoint["hidden_size"])
    model.load_state_dict(checkpoint["state_dict"])
    angle = np.unwrap(np.deg2rad(np.asarray(angle_deg, dtype=float)))
    normalized = (np.diff(angle) - metadata["mean"]) / metadata["std"]
    data = windows(normalized, metadata["window_samples"], metadata["window_samples"])
    if not len(data):
        raise ValueError("At least 26 angle samples are required.")
    model.eval()
    with torch.no_grad():
        pred = model(torch.from_numpy(data[:, :-1, None]))
        scores = torch.sqrt(torch.mean((pred - torch.from_numpy(data[:, 1:, None])) ** 2, dim=(1, 2))).numpy()
    score = float(np.quantile(scores, .95))
    threshold = float(metadata["threshold_q95"])
    ratio = score / max(threshold, 1e-12)
    probability = float(0.5 * ratio if ratio <= 1 else 0.5 + 0.5 * (1 - np.exp(-(ratio - 1))))
    probability = min(max(probability, 0.0), 1.0)
    confidence = float(min(1.0, 2 * abs(probability - .5)))
    decision = "Anomalous" if score > threshold else "Normal"
    return {"decision": decision, "anomaly_probability": probability, "normal_probability": 1 - probability, "anomaly_score": score, "threshold": threshold, "reliability_score": confidence, "model_status": "READY_ONE_CLASS", "warning": metadata["warning"]}


def predict_csv(content: bytes, name: str) -> dict[str, Any]:
    if name.startswith("_LBNL") or name.startswith("LBNL"):
        frame = pd.read_csv(io.BytesIO(content), header=None, names=["timestamp_ns", "voltage_angle_deg"])
        column = "voltage_angle_deg"
    else:
        frame = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
        candidates = [c for c in frame.columns if re.search(r"angle|theta|phase", str(c), re.I)]
        if not candidates:
            raise ValueError("No voltage phase-angle column was detected for the one-class model.")
        column = candidates[0]
    angle = pd.to_numeric(frame[column], errors="coerce").interpolate(limit_direction="both").to_numpy(float)
    result = predict_angle(angle)
    return {"file": name, "rows": len(frame), "angle_column": str(column), **result}
