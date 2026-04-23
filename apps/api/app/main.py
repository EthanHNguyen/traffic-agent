from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.service import answer_traffic_question
from app.config import settings
from app.ingestion.vdot import ingest_vdot_snapshot
from app.models.traffic import (
    CorridorHistoryResponse,
    HealthResponse,
    Sensor,
    SensorReading,
    TrafficQueryRequest,
    TrafficQueryResponse,
)
from app.db.repository import corridor_history, get_latest_sensor_reading

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name)


@app.post("/api/query", response_model=TrafficQueryResponse)
def query_traffic(request: TrafficQueryRequest) -> TrafficQueryResponse:
    return answer_traffic_question(request.message)


@app.post("/api/ingest/vdot")
def ingest_vdot() -> dict[str, int | str | None]:
    run = ingest_vdot_snapshot()
    return {
        "id": run.id,
        "source": run.source,
        "dataset_id": run.dataset_id,
        "records_seen": run.records_seen,
        "records_written": run.records_written,
        "status": run.status,
        "error_message": run.error_message,
    }

@app.get("/api/sensors/{sensor_id}/latest", response_model=SensorReading)
def get_sensor_latest(sensor_id: str) -> SensorReading:
    reading = get_latest_sensor_reading(sensor_id)
    if not reading:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No observations found for this sensor")
    return reading

@app.get("/api/sensors", response_model=list[Sensor])
def get_all_sensors(corridor: str | None = None, direction: str | None = None) -> list[Sensor]:
    from app.db.repository import list_sensors
    return list_sensors(corridor, direction)

@app.get("/api/corridors/{corridor}/history", response_model=CorridorHistoryResponse)
def get_corridor_history(
    corridor: str,
    direction: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
    bucket: str = "5m",
) -> CorridorHistoryResponse:
    return corridor_history(corridor, direction=direction, start_at=start_at, end_at=end_at, bucket=bucket)
