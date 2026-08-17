from __future__ import annotations

import io

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from pmu_backend import service
from pmu_backend.main import app
from pmu_backend.preprocessing import physics_residual, prepare_event


def event_bytes(label: str | None, seed: int, unstable: bool = False) -> bytes:
    rng = np.random.default_rng(seed)
    count, dt = 80, 0.02
    time = pd.date_range("2026-01-01", periods=count, freq="20ms")
    deviation = (0.02 if not unstable else 0.3) * (1 - np.exp(-np.arange(count) * dt / 0.2))
    frequency = 50 + deviation + rng.normal(0, 0.0005, count)
    theta = np.rad2deg(np.cumsum(2 * np.pi * (frequency - 50) * dt))
    frame = pd.DataFrame(
        {
            "Timestamp": time,
            "Mag_VA_PMU1": 1 - (0.01 if unstable else 0.001) * np.linspace(0, 1, count),
            "Angle_VA_PMU1": theta,
            "Mag_IA_PMU1": 1 + rng.normal(0, 0.002, count),
            "Angle_IA_PMU1": theta - 10,
            "Frequency": frequency,
        }
    )
    if label is not None:
        frame["Stability"] = label
    return frame.to_csv(index=False).encode()


def test_unlabelled_event_has_physics_but_no_classifier(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "ARTIFACT_DIR", tmp_path / "artifacts")
    event = prepare_event(event_bytes(None, 1), "unlabelled.csv", 50.0)
    physics = physics_residual(event, 50.0, 200)
    output = service.predict(event, 50.0, 200)
    assert physics["available"] is True
    assert physics["R_phy"] < 0.1
    assert output["model_status"] == "UNTRAINED"
    assert output["P_stable"] is None
    assert output["P_unstable"] is None
    assert output["decision"] == "Uncertain"


def test_training_refuses_missing_labels(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "ARTIFACT_DIR", tmp_path / "artifacts")
    with pytest.raises(ValueError, match="explicit Stable/Unstable label"):
        service.train([prepare_event(event_bytes(None, 1), "event.csv", 50.0)], epochs=1)


def test_labelled_cfc_train_calibrate_predict(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "ARTIFACT_DIR", tmp_path / "artifacts")
    events = [
        prepare_event(event_bytes("Stable", 1), "s1.csv", 50.0),
        prepare_event(event_bytes("Stable", 2), "s2.csv", 50.0),
        prepare_event(event_bytes("Unstable", 3, True), "u1.csv", 50.0),
        prepare_event(event_bytes("Unstable", 4, True), "u2.csv", 50.0),
    ]
    trained = service.train(events, window_ms=200, epochs=2)
    assert trained["status"] == "TRAINED_UNCALIBRATED"
    calibrated = service.calibrate(events, 50.0)
    assert calibrated["status"] == "READY"
    output = service.predict(events[0], 50.0, 200)
    assert abs(output["P_stable"] + output["P_unstable"] - 1) < 1e-6
    assert 0 < output["U_evi"] <= 1
    assert output["S_rel"] is not None


def test_fastapi_inspection_endpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "ARTIFACT_DIR", tmp_path / "artifacts")
    client = TestClient(app)
    response = client.post(
        "/dataset/inspect",
        files={"file": ("event.csv", io.BytesIO(event_bytes(None, 1)), "text/csv")},
        data={"nominal_frequency": "50"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model"]["status"] == "UNTRAINED"
    assert body["inspection"]["sampling_interval_ms"] == pytest.approx(20.0)
    assert body["inspection"]["angle_unit_detected"] == "deg"


def test_one_class_artifact_is_ready():
    from pmu_backend.one_class import ARTIFACT_DIR, predict_csv

    assert (ARTIFACT_DIR / "model.pt").exists()
    rows = "".join(f"{1443657600000000000 + i * 8333333},{357.8 + 0.04 * i}\n" for i in range(80))
    result = predict_csv(rows.encode(), "_LBNL_test.csv")
    assert result["model_status"] == "READY_ONE_CLASS"
    assert result["decision"] in {"Normal", "Anomalous"}
    assert 0 <= result["anomaly_probability"] <= 1
    assert 0 <= result["reliability_score"] <= 1
