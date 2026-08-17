from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from pmu_backend.one_class import predict_csv

app = FastAPI(title="LBNL One-Class CfC API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok", "model_status": "READY_ONE_CLASS"}


@app.post("/api/anomaly/predict")
async def anomaly_predict(file: UploadFile = File(...)):
    try:
        return predict_csv(await file.read(), file.filename or "event.csv")
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(422, str(exc)) from exc
