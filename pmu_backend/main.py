from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .preprocessing import WINDOWS_MS, inspection, physics_residual, prepare_event
from .service import calibrate, evaluate, model_status, predict, train
from .one_class import predict_csv


app = FastAPI(title="Physics-Calibrated Evidential CfC PMU API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://pmu-eight.vercel.app"],
    allow_origin_regex=r"https://lovable-frontend-[a-z0-9-]+\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _event(file: UploadFile, nominal_frequency: float, angle_unit: str = "auto"):
    try:
        return prepare_event(await file.read(), file.filename or "event.csv", nominal_frequency, angle_unit)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


async def _events(files: list[UploadFile], nominal_frequency: float):
    return [await _event(file, nominal_frequency) for file in files]


@app.get("/")
def root():
    return {"service": app.title, "docs": "/docs", "model": model_status()}


@app.get("/health")
def health():
    return {"status": "ok", "model": model_status()}


@app.post("/dataset/inspect")
async def inspect_dataset(file: Annotated[UploadFile, File()], nominal_frequency: Annotated[float, Form()] = 50.0, angle_unit: Annotated[str, Form()] = "auto"):
    event = await _event(file, nominal_frequency, angle_unit)
    return {"model": model_status(), "inspection": inspection(event, nominal_frequency)}


@app.post("/physics-residual")
async def calculate_physics(file: Annotated[UploadFile, File()], nominal_frequency: Annotated[float, Form()] = 50.0, window_ms: Annotated[int, Form()] = 200, angle_unit: Annotated[str, Form()] = "auto"):
    if window_ms not in WINDOWS_MS:
        raise HTTPException(422, f"window_ms must be one of {WINDOWS_MS}")
    event = await _event(file, nominal_frequency, angle_unit)
    return physics_residual(event, nominal_frequency, window_ms)


@app.post("/predict")
async def predict_event(file: Annotated[UploadFile, File()], nominal_frequency: Annotated[float, Form()] = 50.0, window_ms: Annotated[int, Form()] = 200, angle_unit: Annotated[str, Form()] = "auto"):
    if window_ms not in WINDOWS_MS:
        raise HTTPException(422, f"window_ms must be one of {WINDOWS_MS}")
    event = await _event(file, nominal_frequency, angle_unit)
    return {"inspection": inspection(event, nominal_frequency), "prediction": predict(event, nominal_frequency, window_ms)}


@app.post("/predict/windows")
async def predict_windows(file: Annotated[UploadFile, File()], nominal_frequency: Annotated[float, Form()] = 50.0, angle_unit: Annotated[str, Form()] = "auto"):
    event = await _event(file, nominal_frequency, angle_unit)
    return {
        "inspection": inspection(event, nominal_frequency),
        "model": model_status(),
        "windows": {str(window): predict(event, nominal_frequency, window) for window in WINDOWS_MS},
    }


@app.post("/train")
async def train_model(files: Annotated[list[UploadFile], File()], nominal_frequency: Annotated[float, Form()] = 50.0, window_ms: Annotated[int, Form()] = 200, epochs: Annotated[int, Form()] = 40):
    try:
        return train(await _events(files, nominal_frequency), window_ms, max(1, min(epochs, 500)))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/calibrate")
async def calibrate_model(files: Annotated[list[UploadFile], File()], nominal_frequency: Annotated[float, Form()] = 50.0):
    try:
        return calibrate(await _events(files, nominal_frequency), nominal_frequency)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/evaluate")
async def evaluate_model(files: Annotated[list[UploadFile], File()], nominal_frequency: Annotated[float, Form()] = 50.0):
    try:
        return evaluate(await _events(files, nominal_frequency), nominal_frequency)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/stream/emulate")
async def emulate_stream(file: Annotated[UploadFile, File()], nominal_frequency: Annotated[float, Form()] = 50.0, speed: Annotated[float, Form()] = 1.0):
    event = await _event(file, nominal_frequency)
    speed = max(speed, 0.01)

    async def rows():
        previous = event.time[0]
        for index, (_, row) in enumerate(event.frame.iterrows()):
            if index:
                await asyncio.sleep(min(max(event.time[index] - previous, 0) / speed, 1.0))
            previous = event.time[index]
            yield json.dumps({"index": index, "elapsed_s": float(event.time[index]), "row": row.where(row.notna(), None).to_dict()}, default=str) + "\n"

    return StreamingResponse(rows(), media_type="application/x-ndjson", headers={"X-PMU-Sampling-Interval-Ms": str(event.dt * 1000)})


@app.post("/anomaly/predict")
async def predict_anomaly(file: Annotated[UploadFile, File()]):
    try:
        return predict_csv(await file.read(), file.filename or "event.csv")
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(422, str(exc)) from exc
