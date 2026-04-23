from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import xmltodict
from psycopg.types.json import Jsonb

from app.config import settings
from app.db.connection import get_connection

SOURCE = "vdot-smarterroads"
WZDX_DATASET_ID = 38
VIRGINIA_LAT_RANGE = (36.0, 40.0)
VIRGINIA_LON_RANGE = (-84.0, -75.0)
EASTERN = ZoneInfo("America/New_York")
MAX_SENSOR_OBSERVATION_AGE = timedelta(days=1)
MAX_SENSOR_FUTURE_SKEW = timedelta(minutes=10)

MVP_DATASETS = {
    1: "Traffic Sensor Stations",
    3: "VDOT Incidents",
    4: "VATraffic Planned Events, Travel Advisories & Lane Closures",
    38: "WorkZone Data eXchange (WZDx)",
}

@dataclass
class IngestionResult:
    seen: int = 0
    written: int = 0
    skipped: int = 0
    errored: int = 0
    
    def __add__(self, other: IngestionResult) -> IngestionResult:
        return IngestionResult(
            seen=self.seen + other.seen,
            written=self.written + other.written,
            skipped=self.skipped + other.skipped,
            errored=self.errored + other.errored
        )

@dataclass(frozen=True)
class IngestionRun:
    id: int | None
    source: str
    records_seen: int
    records_written: int
    status: str
    records_skipped: int = 0
    records_errored: int = 0
    dataset_id: int | None = None
    error_message: str | None = None

class SmarterRoadsError(RuntimeError):
    pass

class SmarterRoadsClient:
    def __init__(self) -> None:
        self.services_base_url = settings.vdot_services_base_url.rstrip("/")
        self.gateway_base_url = settings.vdot_gateway_base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self.services_base_url,
            timeout=60.0,
            follow_redirects=True,
        )

    def __enter__(self) -> SmarterRoadsClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self._client.close()

    def login(self) -> None:
        token_response = self._client.get("/auth/token")
        token_response.raise_for_status()
        xsrf_token = self._client.cookies.get("XSRF-TOKEN")
        headers = {"X-XSRF-TOKEN": xsrf_token} if xsrf_token else {}
        response = self._client.post(
            "/auth/login",
            json={"username": settings.vdot_username, "password": settings.vdot_password},
            headers=headers,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise SmarterRoadsError("SmarterRoads login failed")

    def list_login_datasets(self) -> list[dict[str, Any]]:
        return self._data_from_get("/datasets/login/datasets")

    def get_dataset_details(self, dataset_id: int) -> dict[str, Any]:
        return self._data_from_get(f"/datasets/details/{dataset_id}?swagger=true")

    def get_dataset_locations_by_type(self, dataset_id: int) -> dict[str, str]:
        return self._data_from_get(f"/datasets/{dataset_id}/locations/types/")

    def subscribe(self, dataset_id: int) -> None:
        xsrf_token = self._client.cookies.get("XSRF-TOKEN")
        headers = {"X-XSRF-TOKEN": xsrf_token} if xsrf_token else {}
        response = self._client.post(
            f"/users/datasets/{dataset_id}/subscribe",
            json={},
            headers=headers,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            message = payload.get("message") or payload.get("user_message") or "subscription failed"
            raise SmarterRoadsError(str(message))

    def get_user_token(self, dataset_id: int) -> str:
        token = self._data_from_get(f"/users/token/{dataset_id}")
        if not isinstance(token, str) or not token:
            raise SmarterRoadsError(f"No download token returned for dataset {dataset_id}")
        return token

    def download_json(self, path: str, token: str) -> dict[str, Any]:
        response = httpx.get(
            f"{self.gateway_base_url}{path}",
            params={"token": token},
            timeout=90.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.json()

    def _data_from_get(self, path: str) -> Any:
        response = self._client.get(path)
        response.raise_for_status()
        payload = response.json()
        if not payload.get("success"):
            raise SmarterRoadsError(f"SmarterRoads request failed: {path}")
        return payload.get("data")

def _record_ingestion_run(run: IngestionRun) -> IngestionRun:
    query = """
        INSERT INTO ingestion_runs (
            source, dataset_id, status, finished_at,
            records_seen, records_written, records_skipped, records_errored, error_message
        )
        VALUES (%s, %s, %s, now(), %s, %s, %s, %s, %s)
        RETURNING id
    """
    with get_connection() as connection:
        row = connection.execute(
            query,
            (
                run.source, run.dataset_id, run.status,
                run.records_seen, run.records_written, run.records_skipped, run.records_errored,
                run.error_message,
            ),
        ).fetchone()

    return IngestionRun(
        id=row["id"],
        source=run.source,
        dataset_id=run.dataset_id,
        records_seen=run.records_seen,
        records_written=run.records_written,
        records_skipped=run.records_skipped,
        records_errored=run.records_errored,
        status=run.status,
        error_message=run.error_message,
    )

def _json_hash(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

def _sync_dataset_metadata(client: SmarterRoadsClient) -> None:
    catalog = {
        int(dataset["dataset_id"]): dataset
        for dataset in client.list_login_datasets()
        if int(dataset.get("dataset_id", 0)) in MVP_DATASETS
    }
    with get_connection() as connection:
        for dataset_id, fallback_name in MVP_DATASETS.items():
            details = client.get_dataset_details(dataset_id) or {}
            catalog_entry = catalog.get(dataset_id, {})
            inner_details = details.get("details") or {}
            fields = inner_details.get("fields") or {}
            swagger = details.get("swagger") or {}
            formats = sorted({*fields.keys(), *swagger.keys()})
            default_format = details.get("default_format") or details.get("format")
            connection.execute(
                """
                INSERT INTO vdot_datasets (
                    dataset_id, dataset_name, source, update_rate, formats, default_format, is_mvp, last_seen_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, true, now())
                ON CONFLICT (dataset_id) DO UPDATE
                SET dataset_name = EXCLUDED.dataset_name,
                    source = EXCLUDED.source,
                    update_rate = EXCLUDED.update_rate,
                    formats = EXCLUDED.formats,
                    default_format = EXCLUDED.default_format,
                    is_mvp = true,
                    last_seen_at = now()
                """,
                (
                    dataset_id,
                    details.get("dataset_name") or catalog_entry.get("dataset_name") or fallback_name,
                    "VDOT SmarterRoads",
                    details.get("update_rate") or catalog_entry.get("update_rate"),
                    formats,
                    default_format,
                ),
            )

def _sync_dataset_assets(dataset_id: int, locations_by_type: dict[str, str]) -> str | None:
    geojson_path = locations_by_type.get("geojson")
    with get_connection() as connection:
        for data_format, path in locations_by_type.items():
            if not path:
                continue
            connection.execute(
                """
                INSERT INTO vdot_dataset_assets (
                    dataset_id, format, download_url, last_checked_at
                )
                VALUES (%s, %s, %s, now())
                ON CONFLICT (dataset_id, format) DO UPDATE
                SET download_url = EXCLUDED.download_url,
                    last_checked_at = now()
                """,
                (dataset_id, data_format, f"{settings.vdot_gateway_base_url.rstrip('/')}{path}"),
            )
    return geojson_path

def _resolve_all_dataset_assets(client: SmarterRoadsClient) -> None:
    for dataset_id in MVP_DATASETS:
        details = client.get_dataset_details(dataset_id)
        if not details.get("subscribed"):
            client.subscribe(dataset_id)
        _ = client.get_user_token(dataset_id)
        locations_by_type = client.get_dataset_locations_by_type(dataset_id)
        _sync_dataset_assets(dataset_id, locations_by_type)

def _safe_float(val: Any, default: float | None = None) -> float | None:
    if val is None or str(val).lower() in ("undefined", "null", "none", ""):
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"undefined", "null", "none"}:
        return None
    return text

def _point_in_virginia(latitude: float, longitude: float) -> bool:
    return (
        VIRGINIA_LAT_RANGE[0] <= latitude <= VIRGINIA_LAT_RANGE[1]
        and VIRGINIA_LON_RANGE[0] <= longitude <= VIRGINIA_LON_RANGE[1]
    )

def _parse_georss_point(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, str):
        return None
    try:
        latitude_raw, longitude_raw = value.split()
        latitude = float(latitude_raw)
        longitude = float(longitude_raw)
    except ValueError:
        return None
    if not _point_in_virginia(latitude, longitude):
        return None
    return latitude, longitude

def _coordinate_pairs(coordinates: Any) -> list[tuple[float, float]]:
    if (
        isinstance(coordinates, list)
        and len(coordinates) >= 2
        and isinstance(coordinates[0], int | float)
        and isinstance(coordinates[1], int | float)
    ):
        return [(float(coordinates[0]), float(coordinates[1]))]
    if isinstance(coordinates, list):
        pairs: list[tuple[float, float]] = []
        for child in coordinates:
            pairs.extend(_coordinate_pairs(child))
        return pairs
    return []

def _geojson_geometry_in_virginia(geometry: Any) -> bool:
    if not isinstance(geometry, dict):
        return False
    pairs = _coordinate_pairs(geometry.get("coordinates"))
    return bool(pairs) and all(_point_in_virginia(latitude=lat, longitude=lon) for lon, lat in pairs)

def _parse_sensor_observed_at(value: str | None) -> datetime | None:
    if not value:
        return None
    ts_clean = value.replace("ET", "").strip()
    try:
        observed_local = datetime.strptime(ts_clean, "%b %d, %Y, %I:%M:%S %p").replace(
            tzinfo=EASTERN
        )
    except ValueError:
        return None
    return observed_local.astimezone(UTC)

def _parse_sensor_description(desc: str) -> dict[str, str]:
    result = {}
    match = re.search(r"Updated At:\s*(.*?)(?:$)", desc, re.IGNORECASE)
    if match:
        result["updated_at"] = match.group(1).strip()
        desc = desc[:match.start()].strip().rstrip(",")
    parts = desc.split(",")
    for part in parts:
        if ":" in part:
            key, val = part.split(":", 1)
            result[key.strip().lower().replace(" ", "_")] = val.strip()
    return result

def _upsert_vdot_sensor_station(connection: Any, sensor_id: str, items: list[dict[str, Any]]) -> bool:
    """Aggregates multiple lane-level items into a single station-level observation."""
    if not items: return False
    
    # 1. Collective Metadata (use first item as representative)
    first = items[0]
    desc_str = first.get("description", "")
    details = _parse_sensor_description(desc_str)
    point = _parse_georss_point(first.get("georss:point"))
    if not point: return False
    lat, lon = point
    geom_wkt = f"POINT({lon} {lat})"

    # Station Name: Use title of a NORMAL lane if available, otherwise just first title
    station_name = first.get("title", sensor_id)
    for item in items:
        if "normal" in (item.get("description", "").lower()):
            station_name = item.get("title", station_name)
            break

    # 2. Aggregation Logic (Volume-Weighted Speed)
    total_volume = 0.0
    weighted_speed_sum = 0.0
    occupancy_sum = 0.0
    occupancy_count = 0
    valid_speed_weight = 0.0
    
    # Track most recent 'Updated At' across all lanes.
    latest_observed_at: datetime | None = None
    
    for item in items:
        lane_details = _parse_sensor_description(item.get("description", ""))
        speed = _safe_float(lane_details.get("speed"))
        volume = _safe_float(lane_details.get("volume"))
        occupancy = _safe_float(lane_details.get("occupancy"))
        
        # Plausibility Filters
        if speed is not None and (speed < 0 or speed > 150): speed = None
        if volume is not None and volume < 0: volume = 0
        if occupancy is not None and (occupancy < 0 or occupancy > 100): occupancy = None

        if volume is not None:
            total_volume += volume
        if speed is not None and not (speed == 0 and (volume is None or volume == 0)):
            # We weight speed by volume so a lane with 20 cars has 20x impact on avg speed
            # than a lane with 1 car. If all volumes are 0, use simple average.
            weight = volume or 1
            weighted_speed_sum += speed * weight
            valid_speed_weight += weight
        
        if occupancy is not None:
            occupancy_sum += occupancy
            occupancy_count += 1

        observed_at = _parse_sensor_observed_at(lane_details.get("updated_at"))
        if observed_at and (latest_observed_at is None or observed_at > latest_observed_at):
            latest_observed_at = observed_at

    avg_speed = weighted_speed_sum / valid_speed_weight if valid_speed_weight > 0 else 0.0
    avg_occupancy = occupancy_sum / occupancy_count if occupancy_count > 0 else 0.0
    volume_vph = int(total_volume * 60) # Scale minute-counts to Hourly Rate
    latest_observed_at = latest_observed_at or datetime.now(UTC)
    now = datetime.now(UTC)
    if (
        latest_observed_at < now - MAX_SENSOR_OBSERVATION_AGE
        or latest_observed_at > now + MAX_SENSOR_FUTURE_SKEW
    ):
        return False

    # 3. Persistent Storage
    source_record = connection.execute(
        """
        INSERT INTO source_records (
            source_key, source, dataset_id, source_id, source_updated_at,
            payload_hash, raw_payload, last_seen_at
        )
        VALUES (%s, %s, 1, %s, %s, %s, %s, now())
        ON CONFLICT (source_key) DO UPDATE
        SET source_updated_at = EXCLUDED.source_updated_at,
            payload_hash = EXCLUDED.payload_hash,
            raw_payload = EXCLUDED.raw_payload,
            last_seen_at = now()
        RETURNING id
        """,
        (
            f"vdot:1:{sensor_id}",
            SOURCE,
            sensor_id,
            latest_observed_at,
            _json_hash({"station_id": sensor_id, "items": items}),
            Jsonb(items),
        )
    ).fetchone()

    connection.execute(
        """
        INSERT INTO places (
            id, name, place_type, corridor, direction, mile_marker, geometry, source_record_id
        )
        VALUES (%s, %s, 'sensor', %s, %s, %s, ST_GeomFromText(%s, 4326)::geography, %s)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, corridor = EXCLUDED.corridor, direction = EXCLUDED.direction,
            mile_marker = EXCLUDED.mile_marker, geometry = EXCLUDED.geometry,
            source_record_id = EXCLUDED.source_record_id, updated_at = now()
        """,
        (
            sensor_id,
            station_name,
            _clean_text(details.get("route_name")),
            _clean_text(details.get("lane_direction")),
            _safe_float(details.get("mile_marker")),
            geom_wkt,
            source_record["id"],
        )
    )

    connection.execute(
        """
        INSERT INTO traffic_observations (place_id, observed_at, speed_mph, volume_vph, occupancy_pct, source_record_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (place_id, observed_at) DO UPDATE
        SET speed_mph = EXCLUDED.speed_mph,
            volume_vph = EXCLUDED.volume_vph,
            occupancy_pct = EXCLUDED.occupancy_pct,
            source_record_id = EXCLUDED.source_record_id
        """,
        (sensor_id, latest_observed_at, avg_speed, volume_vph, avg_occupancy, source_record["id"])
    )
    return True

def _parse_vdot_location(item: dict[str, Any]) -> str | None:
    if not isinstance(item, dict): return None
    loc_fields = ["orci:mid_point", "orci:start_point", "orci:end_point", "orci:the_geom"]
    for field in loc_fields:
        val = item.get(field)
        if not isinstance(val, dict): continue
        point = val.get("gml:Point")
        if isinstance(point, dict):
            pos = point.get("gml:pos")
            if pos and isinstance(pos, str):
                try:
                    lat, lon = pos.split()
                    return f"POINT({lon} {lat})"
                except ValueError: continue
    return None

def _upsert_vdot_incident_event(connection: Any, item: dict[str, Any], dataset_id: int) -> int:
    if not isinstance(item, dict):
        return 2
    try:
        source_id = item.get("orci:event_id") or item.get("@_gml:id")
        if not source_id: return 2
        source_key = f"vdot:{dataset_id}:{source_id}"
        source_updated_at = _parse_datetime(item.get("orci:update_time"))
        geom_wkt = _parse_vdot_location(item)
        if not geom_wkt: return 2
        starts_at = _parse_datetime(item.get("orci:initial_report")) or source_updated_at or datetime.now(UTC)
        ends_at = _parse_datetime(item.get("orci:lanes_clear_time"))
        status_str = str(item.get("orci:status") or "Open").lower()
        status = "closed" if "closed" in status_str else "active"
        severity_str = str(item.get("orci:severity") or "Level I").lower()
        if "level i" in severity_str: severity = "low"
        elif "level ii" in severity_str: severity = "medium"
        elif "level iii" in severity_str: severity = "high"
        else: severity = "medium"
        event_type = "incident" if dataset_id == 3 else "lane_closure"
        if "work zone" in str(item.get("orci:event_subcategory") or "").lower(): event_type = "work_zone"
        source_record = connection.execute(
            """
            INSERT INTO source_records (source_key, source, dataset_id, source_id, source_updated_at, payload_hash, raw_payload, last_seen_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (source_key) DO UPDATE
            SET source_updated_at = EXCLUDED.source_updated_at, payload_hash = EXCLUDED.payload_hash, raw_payload = EXCLUDED.raw_payload, last_seen_at = now()
            RETURNING id
            """,
            (source_key, SOURCE, dataset_id, source_id, source_updated_at, _json_hash(item), Jsonb(item))
        ).fetchone()
        connection.execute(
            """
            INSERT INTO traffic_events (id, event_type, title, description, status, severity, corridor, starts_at, ends_at, geometry, source_record_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326)::geography, %s)
            ON CONFLICT (id) DO UPDATE
            SET event_type = EXCLUDED.event_type, title = EXCLUDED.title, description = EXCLUDED.description, status = EXCLUDED.status,
                severity = EXCLUDED.severity, corridor = EXCLUDED.corridor, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
                geometry = EXCLUDED.geometry, source_record_id = EXCLUDED.source_record_id, updated_at = now()
            """,
            (f"vdot-{dataset_id}-{source_id}", event_type, str(item.get("orci:template_511_text") or item.get("orci:route_name") or "VDOT Event"),
             str(item.get("orci:public_free_text") or item.get("orci:template_511_text") or ""), status, severity, item.get("orci:route_name"), starts_at, ends_at, geom_wkt, source_record["id"])
        )
        return 1
    except Exception as e:
        print(f"DEBUG: Error in _upsert_vdot_incident_event for dataset {dataset_id}: {e}")
        return 0

def _ingest_sensors(client: SmarterRoadsClient) -> IngestionResult:
    locations = client.get_dataset_locations_by_type(1)
    path = locations.get("georss")
    if not path: return IngestionResult()
    token = client.get_user_token(1)
    response = httpx.get(f"{client.gateway_base_url}{path}", params={"token": token}, timeout=90.0, follow_redirects=True)
    response.raise_for_status()
    data = xmltodict.parse(response.text)
    items = data.get("rss", {}).get("channel", {}).get("item", [])
    if isinstance(items, dict): items = [items]
    if not isinstance(items, list): return IngestionResult(errored=1)
    
    # 100% Accuracy Fix: Group items by Station ID before upserting
    stations = defaultdict(list)
    for item in items:
        link = item.get("link", "")
        station_id = link.split("/")[-1].replace(".xml", "") if link else _json_hash(item)
        stations[station_id].append(item)
        
    res = IngestionResult()
    res.seen = len(items)
    with get_connection() as connection:
        for station_id, station_items in stations.items():
            if _upsert_vdot_sensor_station(connection, station_id, station_items):
                res.written += 1
            else:
                res.skipped += 1
    return res

def _ingest_incidents_or_events(client: SmarterRoadsClient, dataset_id: int) -> IngestionResult:
    locations = client.get_dataset_locations_by_type(dataset_id)
    path = (locations or {}).get("wfs-json")
    if not path: return IngestionResult()
    token = client.get_user_token(dataset_id)
    items = client.download_json(path, token)
    if not isinstance(items, list): return IngestionResult()
    res = IngestionResult()
    with get_connection() as connection:
        for item in items:
            res.seen += 1
            status = _upsert_vdot_incident_event(connection, item, dataset_id)
            if status == 1: res.written += 1
            elif status == 2: res.skipped += 1
            else: res.errored += 1
    return res

def _upsert_wzdx_event(connection: Any, feature: dict[str, Any]) -> int:
    try:
        source_id = str(feature.get("id") or feature.get("properties", {}).get("id") or _json_hash(feature))
        source_key = f"vdot:{WZDX_DATASET_ID}:{source_id}"
        properties = feature.get("properties") or {}
        core_details = properties.get("core_details") or {}
        geometry = feature.get("geometry")
        if not geometry: return 2
        if not _geojson_geometry_in_virginia(geometry): return 2
        starts_at = _parse_datetime(properties.get("start_date")) or _parse_datetime(core_details.get("update_date")) or datetime.now(UTC)
        ends_at = _parse_datetime(properties.get("end_date"))
        roads = core_details.get("road_names") or []
        source_record = connection.execute(
            """
            INSERT INTO source_records (source_key, source, dataset_id, source_id, source_updated_at, payload_hash, raw_payload, last_seen_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (source_key) DO UPDATE
            SET source_updated_at = EXCLUDED.source_updated_at, payload_hash = EXCLUDED.payload_hash, raw_payload = EXCLUDED.raw_payload, last_seen_at = now()
            RETURNING id
            """,
            (source_key, SOURCE, WZDX_DATASET_ID, source_id, _parse_datetime(core_details.get("update_date")), _json_hash(feature), Jsonb(feature))
        ).fetchone()
        
        event_type = properties.get("core_details", {}).get("event_type")
        if event_type == "work-zone": event_type = "work_zone"
        elif event_type == "detour": event_type = "advisory"
        else: event_type = "lane_closure"
        
        now = datetime.now(UTC)
        status = "closed" if ends_at and ends_at < now else ("planned" if starts_at > now else "active")
        
        impact = properties.get("vehicle_impact")
        if impact in {"all-lanes-closed", "alternating-one-way"}: severity = "high"
        elif impact in {"some-lanes-closed", "all-lanes-open"}: severity = "medium"
        elif impact == "no-impact": severity = "low"
        else: severity = impact

        connection.execute(
            """
            INSERT INTO traffic_events (id, event_type, title, description, status, severity, corridor, starts_at, ends_at, geometry, source_record_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)::geography, %s)
            ON CONFLICT (id) DO UPDATE
            SET event_type = EXCLUDED.event_type, title = EXCLUDED.title, description = EXCLUDED.description, status = EXCLUDED.status,
                severity = EXCLUDED.severity, corridor = EXCLUDED.corridor, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
                geometry = EXCLUDED.geometry, source_record_id = EXCLUDED.source_record_id, updated_at = now()
            """,
            (f"vdot-wzdx-{source_id}", event_type, f"WZDx work zone on {roads[0] if roads else 'VDOT road'}", core_details.get("description"), status, severity, roads[0] if roads else None, starts_at, ends_at, json.dumps(geometry), source_record["id"])
        )
        return 1
    except Exception: return 0

def _ingest_wzdx(client: SmarterRoadsClient) -> IngestionResult:
    locations_by_type = client.get_dataset_locations_by_type(WZDX_DATASET_ID)
    geojson_path = locations_by_type.get("geojson")
    if not geojson_path: return IngestionResult()
    token = client.get_user_token(WZDX_DATASET_ID)
    payload = client.download_json(geojson_path, token)
    features = payload.get("features") or []
    res = IngestionResult()
    with get_connection() as connection:
        for feature in features:
            res.seen += 1
            status = _upsert_wzdx_event(connection, feature)
            if status == 1: res.written += 1
            elif status == 2: res.skipped += 1
            else: res.errored += 1
    return res

def ingest_vdot_snapshot() -> IngestionRun:
    """Run one SmarterRoads ingestion attempt for all MVP feeds."""
    if not settings.has_vdot_credentials:
        return _record_ingestion_run(IngestionRun(id=None, source=SOURCE, status="missing_credentials", records_seen=0, records_written=0))
    try:
        with SmarterRoadsClient() as client:
            client.login()
            _sync_dataset_metadata(client)
            _resolve_all_dataset_assets(client)
            res = IngestionResult()
            res += _ingest_sensors(client)
            res += _ingest_incidents_or_events(client, 3)
            res += _ingest_incidents_or_events(client, 4)
            res += _ingest_wzdx(client)
            return _record_ingestion_run(IngestionRun(id=None, source=SOURCE, status="success", records_seen=res.seen, records_written=res.written, records_skipped=res.skipped, records_errored=res.errored, dataset_id=WZDX_DATASET_ID))
    except Exception as exc:
        return _record_ingestion_run(IngestionRun(id=None, source=SOURCE, status="failed", records_seen=0, records_written=0, dataset_id=WZDX_DATASET_ID, error_message=str(exc)))
