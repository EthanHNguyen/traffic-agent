import re
from datetime import datetime, timedelta, timezone
from psycopg import Error
from app.db.connection import get_connection
from app.models.traffic import (
    ChartPoint,
    Coordinate,
    CorridorHistoryResponse,
    Incident,
    Sensor,
    SensorReading,
)

def _normalize_corridor(corridor: str | None, direction: str | None) -> tuple[str | None, str | None]:
    if not corridor:
        return None, direction
        
    # Remove any spaces
    corridor = corridor.strip()
    
    # Handle "I-95 S" or "I-95 SB"
    parts = corridor.split(" ")
    if len(parts) == 2:
        return parts[0], parts[1]
        
    return corridor, direction

def list_sensors(corridor: str | None = None, direction: str | None = None) -> list[Sensor]:
    corridor, direction = _normalize_corridor(corridor, direction)
    query = """
        SELECT id, name, corridor, direction, mile_marker,
               ST_Y(geometry::geometry) AS latitude,
               ST_X(geometry::geometry) AS longitude
        FROM places
        WHERE place_type = 'sensor'
    """
    params = []
    if corridor:
        query += " AND (corridor = %s OR corridor LIKE %s)"
        params.append(corridor)
        params.append(f"{corridor}%")
    if direction:
        # Support both 'S' and 'SB' styles
        if len(direction) == 1:
            query += " AND (direction = %s OR direction LIKE %s)"
            params.append(direction)
            params.append(f"{direction}%")
        else:
            query += " AND direction = %s"
            params.append(direction)
    
    query += " ORDER BY corridor, mile_marker NULLS LAST, id"
    
    try:
        with get_connection() as connection:
            rows = connection.execute(query, params).fetchall()
            return [
                Sensor(
                    id=row["id"],
                    name=row["name"],
                    corridor=row["corridor"] or "Unknown",
                    direction=row["direction"] or "N/A",
                    mile_marker=float(row["mile_marker"]) if row["mile_marker"] is not None else None,
                    location=Coordinate(latitude=float(row["latitude"]), longitude=float(row["longitude"])),
                )
                for row in rows
            ]
    except Error:
        return []

def search_corridors(query: str | None = None) -> list[str]:
    sql = """
        SELECT corridor
        FROM places
        WHERE place_type = 'sensor'
          AND corridor IS NOT NULL
    """
    params = []
    if query:
        # Search for either the full corridor name OR the road part
        sql += " AND (corridor = %s OR corridor LIKE %s)"
        params.append(query)
        params.append(f"{query}%")

    sql += " GROUP BY corridor ORDER BY COUNT(*) DESC, corridor LIMIT 25"

    try:
        with get_connection() as connection:
            rows = connection.execute(sql, params).fetchall()
            return [row["corridor"] for row in rows]
    except Error:
        return []

def list_active_incidents(corridor: str | None = None, direction: str | None = None) -> list[Incident]:
    corridor, direction = _normalize_corridor(corridor, direction)
    query = """
        SELECT id, title, description, severity, corridor, starts_at, ends_at,
               ST_Y(geometry::geometry) AS latitude,
               ST_X(geometry::geometry) AS longitude
        FROM traffic_events
        WHERE event_type = 'incident'
          AND status = 'active'
    """
    params = []
    if corridor:
        query += " AND (corridor = %s OR corridor LIKE %s)"
        params.append(corridor)
        params.append(f"{corridor}%")
    
    query += " ORDER BY starts_at DESC LIMIT 100"
    
    try:
        with get_connection() as connection:
            rows = connection.execute(query, params).fetchall()
            return [
                Incident(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"],
                    severity=row["severity"],
                    corridor=row["corridor"] or "Unknown",
                    starts_at=row["starts_at"],
                    ends_at=row["ends_at"],
                    location=Coordinate(latitude=float(row["latitude"]), longitude=float(row["longitude"])),
                )
                for row in rows
            ]
    except Error:
        return []

def get_latest_sensor_reading(sensor_id: str) -> SensorReading | None:
    query = """
        SELECT place_id, observed_at, speed_mph::float, volume_vph, occupancy_pct::float
        FROM traffic_observations
        WHERE place_id = %s
        ORDER BY observed_at DESC
        LIMIT 1
    """
    try:
        with get_connection() as connection:
            row = connection.execute(query, (sensor_id,)).fetchone()
            if not row:
                return None
            return SensorReading(
                place_id=row["place_id"],
                observed_at=row["observed_at"],
                speed_mph=row["speed_mph"],
                volume_vph=row["volume_vph"],
                occupancy_pct=row["occupancy_pct"],
            )
    except Exception as e:
        print(f"Repo Error (latest reading): {e}")
        return None

def corridor_history(
    corridor: str | None,
    direction: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
    bucket: str = "5m",
) -> CorridorHistoryResponse:
    corridor, direction = _normalize_corridor(corridor, direction)
    bucket_intervals = {
        "1m": "1 minute",
        "5m": "5 minutes",
        "15m": "15 minutes",
        "1h": "1 hour",
    }
    interval = bucket_intervals.get(bucket, "5 minutes")
    query = """
        SELECT date_bin(%s::interval, o.observed_at, TIMESTAMPTZ '2000-01-01') AS timestamp,
               AVG(o.speed_mph)::float AS speed_mph,
               COALESCE(AVG(b.avg_speed_mph), AVG(o.speed_mph))::float AS baseline_mph
        FROM traffic_observations o
        JOIN places p ON p.id = o.place_id
        LEFT JOIN traffic_baselines b ON
            o.place_id = b.place_id AND
            EXTRACT(DOW FROM o.observed_at AT TIME ZONE 'America/New_York') = b.day_of_week AND
            EXTRACT(HOUR FROM o.observed_at AT TIME ZONE 'America/New_York') = b.hour_of_day
        WHERE p.place_type = 'sensor'
          AND o.observed_at >= COALESCE(%s::timestamptz, now() - interval '1 hour')
          AND o.observed_at <= COALESCE(%s::timestamptz, now())
        GROUP BY timestamp
        ORDER BY timestamp
    """
    params: list[str | None] = [interval, start_at, end_at]
    if corridor:
        filter_clause = " AND (p.corridor = %s OR p.corridor LIKE %s)"
        params.insert(1, corridor)
        params.insert(2, f"{corridor}%")
        idx = 3
        if direction:
            if len(direction) == 1:
                filter_clause += " AND (p.direction = %s OR p.direction LIKE %s)"
                params.insert(idx, direction)
                params.insert(idx + 1, f"{direction}%")
            else:
                filter_clause += " AND p.direction = %s"
                params.insert(idx, direction)
        
        query = query.replace(
            "WHERE p.place_type = 'sensor'",
            f"WHERE p.place_type = 'sensor'{filter_clause}",
        )

    try:
        with get_connection() as connection:
            rows = connection.execute(
                query,
                params,
            ).fetchall()
            if not rows and start_at is None and end_at is None:
                max_query = """
                    SELECT MAX(o.observed_at) AS max_observed_at
                    FROM traffic_observations o
                    JOIN places p ON p.id = o.place_id
                    WHERE p.place_type = 'sensor'
                """
                max_params = []
                if corridor:
                    max_query += " AND (p.corridor = %s OR p.corridor LIKE %s)"
                    max_params.append(corridor)
                    max_params.append(f"{corridor}%")
                    if direction:
                        if len(direction) == 1:
                            max_query += " AND (p.direction = %s OR p.direction LIKE %s)"
                            max_params.append(direction)
                            max_params.append(f"{direction}%")
                        else:
                            max_query += " AND p.direction = %s"
                            max_params.append(direction)

                max_row = connection.execute(max_query, max_params).fetchone()
                max_observed_at = max_row["max_observed_at"] if max_row else None
                if max_observed_at:
                    fallback_start = max_observed_at - timedelta(hours=1)
                    fallback_params: list[str | None] = [
                        interval,
                        fallback_start.isoformat(),
                        max_observed_at.isoformat(),
                    ]
                    if corridor:
                        fallback_params.insert(1, corridor)
                        fallback_params.insert(2, f"{corridor}%")
                        idx = 3
                        if direction:
                            if len(direction) == 1:
                                fallback_params.insert(idx, direction)
                                fallback_params.insert(idx + 1, f"{direction}%")
                            else:
                                fallback_params.insert(idx, direction)
                            
                    rows = connection.execute(query, fallback_params).fetchall()
            return CorridorHistoryResponse(
                corridor=corridor or "Statewide",
                bucket=bucket if bucket in bucket_intervals else "5m",
                chart=[
                    ChartPoint(
                        timestamp=row["timestamp"],
                        speed_mph=float(row["speed_mph"]),
                        baseline_mph=float(row["baseline_mph"]),
                    )
                    for row in rows
                ],
            )
    except Error as e:
        print(f"Repo Error (corridor history): {e}")
        return CorridorHistoryResponse(corridor=corridor, bucket=bucket, chart=[])
