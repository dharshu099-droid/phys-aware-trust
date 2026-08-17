from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd


WINDOWS_MS = (100, 200, 300, 500)
FEATURES = ("voltage", "current", "theta", "frequency", "rocof")


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _phase(name: str) -> str | None:
    match = re.search(r"(?:^|[_\-])(a|b|c|r|y)(?:[_\-]|$)", name.lower()) or re.search(r"(?:mag|angle|phase)?[vi](a|b|c|r|y)(?:[_\-]|$)", name.lower())
    return match.group(1).upper() if match else None


def _location(name: str) -> str | None:
    parts = [p for p in re.split(r"[_\-\s]+", name) if p]
    ignored = {"mag", "magnitude", "angle", "phase", "voltage", "current", "v", "i", "a", "b", "c", "r", "y"}
    kept = [p for p in parts if p.lower() not in ignored]
    return "_".join(kept[-2:]) if kept else None


@dataclass
class ColumnMap:
    timestamp: str | None
    frequency: str
    rocof: str | None
    voltage_magnitude: list[str]
    voltage_angle: list[str]
    current_magnitude: list[str]
    current_angle: list[str]
    label: str | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "frequency": self.frequency,
            "rocof": self.rocof,
            "voltage_magnitude": self.voltage_magnitude,
            "voltage_angle": self.voltage_angle,
            "current_magnitude": self.current_magnitude,
            "current_angle": self.current_angle,
            "label": self.label,
        }


def detect_columns(columns: list[str]) -> ColumnMap:
    keyed = {column: _key(column) for column in columns}
    timestamp = next((c for c, k in keyed.items() if k in {"timestamp", "datetime", "datetimeutc", "time", "t"} or "timestamp" in k or "datetime" in k), None)
    rocof = next((c for c, k in keyed.items() if "rocof" in k or k in {"dfrequency", "dfdt", "frequencyrate", "freqrate"}), None)
    frequency = next((c for c, k in keyed.items() if k in {"frequency", "freq", "f", "hz"}), None)
    if frequency is None:
        frequency = next((c for c, k in keyed.items() if "frequency" in k and c != rocof), None)
    if frequency is None:
        raise ValueError("No frequency column was detected. Include Frequency, freq, f, or an equivalent header.")

    def angle(c: str, k: str) -> bool:
        return "angle" in k or "phase" in k or k.startswith("theta") or "phasorangle" in k

    voltage_angle = [c for c, k in keyed.items() if angle(c, k) and ("volt" in k or k.startswith("anglev") or k.startswith("thetav"))]
    current_angle = [c for c, k in keyed.items() if angle(c, k) and ("curr" in k or k.startswith("anglei") or k.startswith("thetai"))]
    voltage_magnitude = [c for c, k in keyed.items() if not angle(c, k) and (("volt" in k and ("mag" in k or k.startswith("v"))) or k.startswith("magv"))]
    current_magnitude = [c for c, k in keyed.items() if not angle(c, k) and (("curr" in k and ("mag" in k or k.startswith("i"))) or k.startswith("magi"))]
    label = next((c for c, k in keyed.items() if k in {"label", "target", "stability", "stabilitylabel", "class", "groundtruth"}), None)
    return ColumnMap(timestamp, frequency, rocof, voltage_magnitude, voltage_angle, current_magnitude, current_angle, label)


def read_csv_bytes(content: bytes) -> pd.DataFrame:
    try:
        frame = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
    except Exception as exc:
        raise ValueError(f"CSV parsing failed: {exc}") from exc
    if len(frame) < 3:
        raise ValueError("At least three PMU samples are required.")
    return frame


def _time_seconds(series: pd.Series | None, count: int) -> tuple[np.ndarray, float, str]:
    if series is None:
        return np.arange(count, dtype=float) / 50.0, 0.02, "assumed_50_hz"
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.notna().mean() >= 0.9:
        values = numeric.interpolate(limit_direction="both").to_numpy(float)
        delta = float(np.nanmedian(np.diff(values)))
        scale = 0.001 if abs(delta) >= 1 else 1.0
        values = (values - values[0]) * scale
        return values, max(abs(delta * scale), 1e-6), "numeric_timestamp"
    parsed = pd.to_datetime(series, errors="coerce", utc=True)
    if parsed.notna().mean() < 0.9:
        raise ValueError("Timestamp column could not be parsed reliably.")
    values = (parsed - parsed.iloc[0]).dt.total_seconds().interpolate(limit_direction="both").to_numpy(float)
    return values, max(float(np.nanmedian(np.diff(values))), 1e-6), "datetime_timestamp"


def _numeric(frame: pd.DataFrame, columns: list[str]) -> np.ndarray:
    if not columns:
        return np.empty((len(frame), 0), dtype=float)
    clean = frame[columns].apply(pd.to_numeric, errors="coerce").interpolate(limit_direction="both").ffill().bfill()
    if clean.isna().any().any():
        raise ValueError(f"Columns contain unrecoverable missing values: {columns}")
    return clean.to_numpy(float)


def _label(frame: pd.DataFrame, column: str | None) -> int | None:
    if column is None:
        return None
    values = frame[column].dropna().astype(str).str.strip().str.lower().unique().tolist()
    mapped: set[int] = set()
    for value in values:
        if value in {"stable", "0", "false"}:
            mapped.add(0)
        elif value in {"unstable", "1", "true"}:
            mapped.add(1)
        else:
            raise ValueError(f"Unsupported stability label {value!r}; use Stable/Unstable or 0/1.")
    if len(mapped) != 1:
        raise ValueError("Each PMU event file must contain exactly one event-level stability label.")
    return mapped.pop()


@dataclass
class PreparedEvent:
    name: str
    sha256: str
    frame: pd.DataFrame
    columns: ColumnMap
    time: np.ndarray
    dt: float
    sampling_source: str
    features: np.ndarray
    feature_names: list[str]
    frequency: np.ndarray
    rocof: np.ndarray
    theta: np.ndarray | None
    onset_index: int
    label: int | None
    angle_unit_detected: str | None
    missing_values_filled: int

    def window(self, window_ms: int) -> tuple[np.ndarray, np.ndarray, int, int]:
        samples = max(3, int(round(window_ms / 1000.0 / self.dt)))
        start = min(self.onset_index, max(0, len(self.features) - 3))
        end = min(len(self.features), start + samples)
        return self.features[start:end], self.time[start:end], start, end


def prepare_event(content: bytes, name: str, nominal_frequency: float, angle_unit: str = "auto") -> PreparedEvent:
    if nominal_frequency <= 0:
        raise ValueError("nominal_frequency must be positive.")
    frame = read_csv_bytes(content)
    columns = detect_columns([str(c) for c in frame.columns])
    original_missing = int(frame.isna().sum().sum())
    time, dt, sampling_source = _time_seconds(frame[columns.timestamp] if columns.timestamp else None, len(frame))
    frequency = _numeric(frame, [columns.frequency])[:, 0]
    rocof = _numeric(frame, [columns.rocof])[:, 0] if columns.rocof else np.gradient(frequency, dt)
    voltage = _numeric(frame, columns.voltage_magnitude)
    current = _numeric(frame, columns.current_magnitude)
    angles = _numeric(frame, columns.voltage_angle)
    theta: np.ndarray | None = None
    detected_unit: str | None = None
    if angles.shape[1]:
        if angle_unit not in {"auto", "deg", "rad"}:
            raise ValueError("angle_unit must be auto, deg, or rad.")
        detected_unit = angle_unit if angle_unit != "auto" else ("deg" if float(np.nanpercentile(np.abs(angles), 95)) > 2 * np.pi * 1.2 else "rad")
        radians = np.deg2rad(angles) if detected_unit == "deg" else angles
        theta = np.mean(np.unwrap(radians, axis=0), axis=1)

    parts: list[np.ndarray] = []
    names: list[str] = []
    if voltage.shape[1]:
        parts.extend([voltage.mean(axis=1), voltage.std(axis=1)])
        names.extend(["voltage_mean", "voltage_std"])
    if current.shape[1]:
        parts.extend([current.mean(axis=1), current.std(axis=1)])
        names.extend(["current_mean", "current_std"])
    if theta is not None:
        parts.append(theta)
        names.append("voltage_angle_unwrapped_rad")
    parts.extend([frequency, rocof])
    names.extend(["frequency_hz", "rocof_hz_per_s"])
    features = np.column_stack(parts).astype(np.float32)
    baseline = max(5, min(len(frequency), int(round(0.1 * len(frequency)))))
    f_scale = max(float(np.std(frequency[:baseline])), 1e-4)
    score = np.abs(frequency - nominal_frequency) / f_scale + np.abs(rocof) / max(float(np.std(rocof[:baseline])), 1e-4)
    onset = int(np.argmax(score))
    return PreparedEvent(
        name=name,
        sha256=hashlib.sha256(content).hexdigest(),
        frame=frame,
        columns=columns,
        time=time,
        dt=dt,
        sampling_source=sampling_source,
        features=features,
        feature_names=names,
        frequency=frequency,
        rocof=rocof,
        theta=theta,
        onset_index=onset,
        label=_label(frame, columns.label),
        angle_unit_detected=detected_unit,
        missing_values_filled=original_missing,
    )


def physics_residual(event: PreparedEvent, nominal_frequency: float, window_ms: int) -> dict[str, Any]:
    _, t, start, end = event.window(window_ms)
    if event.theta is None:
        return {"available": False, "reason": "No voltage phase-angle columns were detected.", "R_phy": None, "samples": 0}
    theta = event.theta[start:end]
    frequency = event.frequency[start:end]
    if len(theta) < 3:
        return {"available": False, "reason": "Observation window is too short.", "R_phy": None, "samples": len(theta)}
    theta_dot = np.gradient(theta, event.dt)
    implied = 2 * np.pi * (frequency - nominal_frequency)
    residual = theta_dot - implied
    return {
        "available": True,
        "R_phy": float(np.sqrt(np.mean(np.square(residual)))),
        "samples": len(residual),
        "time_ms": ((t - t[0]) * 1000).round(3).tolist(),
        "residual_rad_per_s": residual.round(8).tolist(),
        "theta_dot_rad_per_s": theta_dot.round(8).tolist(),
        "frequency_implied_rad_per_s": implied.round(8).tolist(),
    }


def inspection(event: PreparedEvent, nominal_frequency: float) -> dict[str, Any]:
    measurement_columns = event.columns.voltage_magnitude + event.columns.voltage_angle + event.columns.current_magnitude + event.columns.current_angle
    locations = sorted({value for c in measurement_columns if (value := _location(str(c)))})
    phases = sorted({value for c in measurement_columns if (value := _phase(str(c)))})
    return {
        "file": event.name,
        "sha256": event.sha256,
        "rows": len(event.frame),
        "columns": event.columns.as_dict(),
        "feature_names": event.feature_names,
        "pmu_locations": locations,
        "phases": phases,
        "sampling_interval_ms": event.dt * 1000,
        "sampling_rate_hz": 1.0 / event.dt,
        "sampling_source": event.sampling_source,
        "nominal_frequency_hz": nominal_frequency,
        "angle_unit_detected": event.angle_unit_detected,
        "missing_values_filled": event.missing_values_filled,
        "event_onset_ms": float(event.time[event.onset_index] * 1000),
        "label": None if event.label is None else ("Stable" if event.label == 0 else "Unstable"),
        "windows": {
            str(ms): {"samples": len(event.window(ms)[0]), "start_index": event.window(ms)[2], "end_index": event.window(ms)[3] - 1}
            for ms in WINDOWS_MS
        },
    }
