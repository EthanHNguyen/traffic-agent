from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Callable

from app.db.repository import corridor_history, list_active_incidents, list_sensors, search_corridors
from app.models.traffic import ChartPoint, Incident, Sensor, UiAction


@dataclass(frozen=True)
class TrafficIntent:
    message: str
    scope: str
    corridor: str | None
    road: str | None
    direction: str | None
    time_range: str


@dataclass(frozen=True)
class TrafficResolution:
    corridor: str | None
    direction: str | None
    label: str
    candidates: list[str]


@dataclass(frozen=True)
class TrafficEvidence:
    chart: list[ChartPoint]
    sensors: list[Sensor]
    incidents: list[Incident]


def parse_traffic_intent(message: str) -> TrafficIntent:
    normalized = message.lower()
    road = _extract_road(normalized)
    direction = _extract_direction(normalized)
    # corridor is now the route/road part, direction is separate
    corridor = road
    scope = "corridor" if corridor else "statewide"

    return TrafficIntent(
        message=message,
        scope=scope,
        corridor=corridor,
        road=road,
        direction=direction or None,
        time_range=_extract_time_range(normalized),
    )


def resolve_traffic_intent(
    intent: TrafficIntent,
    *,
    corridor_searcher: Callable[[str | None], list[str]] | None = None,
) -> TrafficResolution:
    if intent.scope == "statewide" or not intent.corridor:
        return TrafficResolution(corridor=None, direction=None, label="Statewide", candidates=[])

    corridor_searcher = corridor_searcher or search_corridors
    candidates = corridor_searcher(intent.road)
    resolved = _choose_corridor(intent, candidates)
    
    label = resolved or "Statewide"
    if resolved and intent.direction:
        # Avoid redundant labels like "I-95S S" if the corridor already includes the direction
        has_suffix = resolved.endswith(intent.direction) or \
                     (intent.direction == 'N' and resolved.endswith('NB')) or \
                     (intent.direction == 'S' and resolved.endswith('SB')) or \
                     (intent.direction == 'E' and resolved.endswith('EB')) or \
                     (intent.direction == 'W' and resolved.endswith('WB'))
        
        if not has_suffix:
            label = f"{resolved} {intent.direction}"
        else:
            # Just use the resolved name if it's already directional
            label = resolved
        
    return TrafficResolution(
        corridor=resolved,
        direction=intent.direction,
        label=label,
        candidates=candidates
    )


async def fetch_traffic_evidence(
    resolution: TrafficResolution,
    *,
    history_loader: Callable[[str | None, str | None], object] | None = None,
    sensors_loader: Callable[[str | None, str | None], list[Sensor]] | None = None,
    incidents_loader: Callable[[str | None, str | None], list[Incident]] | None = None,
) -> TrafficEvidence:
    history_loader = history_loader or corridor_history
    sensors_loader = sensors_loader or list_sensors
    incidents_loader = incidents_loader or list_active_incidents
    corridor = resolution.corridor
    direction = resolution.direction
    
    sensors_task = asyncio.to_thread(sensors_loader, corridor, direction)
    incidents_task = asyncio.to_thread(incidents_loader, corridor, direction)
    history_task = asyncio.to_thread(history_loader, corridor, direction)
    
    history, sensors, incidents = await asyncio.gather(
        history_task,
        sensors_task,
        incidents_task,
    )
    chart = getattr(history, "chart", [])

    return TrafficEvidence(chart=chart, sensors=sensors, incidents=incidents)


def fetch_traffic_evidence_sync(
    resolution: TrafficResolution,
    *,
    history_loader: Callable[[str | None, str | None], object] | None = None,
    sensors_loader: Callable[[str | None, str | None], list[Sensor]] | None = None,
    incidents_loader: Callable[[str | None, str | None], list[Incident]] | None = None,
) -> TrafficEvidence:
    return asyncio.run(
        fetch_traffic_evidence(
            resolution,
            history_loader=history_loader,
            sensors_loader=sensors_loader,
            incidents_loader=incidents_loader,
        )
    )


def plan_ui_actions(
    intent: TrafficIntent,
    resolution: TrafficResolution,
    evidence: TrafficEvidence,
) -> list[UiAction]:
    actions = [
        UiAction(type="set_corridor", value=resolution.label),
        UiAction(type="set_time_range", value=intent.time_range),
        UiAction(type="set_chart_mode", value="history" if evidence.chart else "latest"),
    ]
    if evidence.sensors:
        # Highlight more sensors if available
        highlighted = evidence.sensors[:50]
        actions.append(UiAction(type="highlight_sensors", value=[sensor.id for sensor in highlighted]))
        actions.append(UiAction(type="focus_map", value=map_focus_for_sensors(evidence.sensors)))
    if evidence.incidents:
        actions.append(UiAction(type="highlight_incidents", value=[incident.id for incident in evidence.incidents[:20]]))
    return actions


def map_focus_for_sensors(sensors: list[Sensor]) -> dict[str, float | int]:
    if not sensors:
        return {"latitude": 37.5, "longitude": -77.5, "zoom": 7}
        
    lats = [s.location.latitude for s in sensors]
    lons = [s.location.longitude for s in sensors]
    
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    
    center_lat = (min_lat + max_lat) / 2
    center_lon = (min_lon + max_lon) / 2
    
    # Simple zoom estimation
    lat_diff = max_lat - min_lat
    lon_diff = max_lon - min_lon
    max_diff = max(lat_diff, lon_diff * 0.8) # Lon degrees are "shorter" at these latitudes
    
    if max_diff < 0.01: zoom = 14
    elif max_diff < 0.05: zoom = 12
    elif max_diff < 0.1: zoom = 11
    elif max_diff < 0.3: zoom = 10
    elif max_diff < 0.6: zoom = 9
    elif max_diff < 1.2: zoom = 8
    else: zoom = 7
    
    return {
        "latitude": round(center_lat, 6),
        "longitude": round(center_lon, 6),
        "zoom": zoom
    }


def _choose_corridor(intent: TrafficIntent, candidates: list[str]) -> str | None:
    if intent.corridor in candidates:
        return intent.corridor

    if intent.road and intent.direction:
        directional = f"{intent.road}{intent.direction}"
        if directional in candidates:
            return directional

    if intent.road and not intent.direction and any(candidate.startswith(intent.road) for candidate in candidates):
        return intent.road

    if intent.road in candidates:
        return intent.road

    if intent.road:
        matching = [candidate for candidate in candidates if candidate.startswith(intent.road)]
        if matching:
            return matching[0]

    return None


def _extract_road(normalized: str) -> str | None:
    interstate = re.search(r"\b(?:i|i-|interstate)\s*-?\s*(\d{1,3})\b", normalized)
    if interstate:
        return f"I-{interstate.group(1)}"

    va_route = re.search(r"\b(?:va|va-|route|rt)\s*-?\s*(\d{1,3})\b", normalized)
    if va_route:
        return f"VA-{va_route.group(1)}"

    us_route = re.search(r"\b(?:us|u\.s\.|highway)\s*-?\s*(\d{1,3})\b", normalized)
    if us_route:
        return f"US-{us_route.group(1)}"

    bare_state_route = re.search(r"\b(?:the\s+)?(\d{1,3})\b", normalized)
    if bare_state_route:
        return f"VA-{bare_state_route.group(1)}"

    return None


def _extract_direction(normalized: str) -> str:
    direction_terms = [
        ("N", ("northbound", "north bound", " north", " nb")),
        ("S", ("southbound", "south bound", " south", " sb")),
        ("E", ("eastbound", "east bound", " east", " eb")),
        ("W", ("westbound", "west bound", " west", " wb")),
    ]
    for suffix, terms in direction_terms:
        if any(term in normalized for term in terms):
            return suffix
    return ""


def _extract_time_range(normalized: str) -> str:
    if "yesterday" in normalized:
        return "yesterday"
    if "week" in normalized or "7 day" in normalized:
        return "last_7d"
    if "today" in normalized or "morning" in normalized:
        return "today"
    return "last_1h"
