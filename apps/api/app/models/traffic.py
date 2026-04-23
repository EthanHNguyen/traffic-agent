from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    latitude: float
    longitude: float


class Sensor(BaseModel):
    id: str
    name: str
    corridor: str
    direction: str
    mile_marker: float | None
    location: Coordinate


class Incident(BaseModel):
    id: str
    title: str
    description: str | None
    severity: Literal["low", "medium", "high", "critical"] | str
    corridor: str
    starts_at: datetime
    ends_at: datetime | None
    location: Coordinate


class ChartPoint(BaseModel):
    timestamp: datetime
    speed_mph: float
    baseline_mph: float


class UiAction(BaseModel):
    type: Literal[
        "set_corridor",
        "set_time_range",
        "set_chart_mode",
        "highlight_sensors",
        "highlight_incidents",
        "focus_map",
    ]
    value: str | list[str] | dict[str, float | int | str]


class TrafficQueryRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=1000)


class TrafficQueryResponse(BaseModel):
    answer: str
    sql: str | None = None
    chart: list[ChartPoint]
    sensors: list[Sensor]
    incidents: list[Incident]
    anomaly_detected: bool
    latency_ms: int
    ui_actions: list[UiAction] = Field(default_factory=list)
    follow_ups: list[str] = Field(default_factory=list)


class CorridorHistoryResponse(BaseModel):
    corridor: str
    bucket: str
    chart: list[ChartPoint]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str

class SensorReading(BaseModel):
    place_id: str
    observed_at: datetime
    speed_mph: float
    volume_vph: int
    occupancy_pct: float
