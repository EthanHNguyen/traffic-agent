"use client";

import { useState, useEffect } from "react";
import CommandBar from "@/components/CommandBar";
import MapPanel from "@/components/MapPanel";
import SpeedChart from "@/components/SpeedChart";
import TrafficControls from "@/components/TrafficControls";
import TrafficStory from "@/components/TrafficStory";
import { fetchCorridorHistory, fetchSensors } from "@/lib/api";
import type { TrafficQueryResponse, Sensor, UiState } from "@/lib/types";

const initialResult: TrafficQueryResponse = {
  answer: "Real-time corridor awareness. Actionable in seconds. I can analyze real-time VDOT data from 1,200+ sensors across Virginia.",
  sql: "",
  chart: [],
  sensors: [],
  incidents: [],
  anomaly_detected: false,
  latency_ms: 0,
  ui_actions: [],
  follow_ups: [],
};

const initialUiState: UiState = {
  corridor: "Statewide",
  timeRange: "now",
  chartMode: "latest",
  highlightedSensorIds: [],
  highlightedIncidentIds: [],
  mapFocus: {
    center: [38.0, -78.0],
    zoom: 7,
  },
};

export type Message = {
  role: "user" | "agent";
  content: string;
};

export default function Home() {
  const [result, setResult] = useState<TrafficQueryResponse>(initialResult);
  const [uiState, setUiState] = useState<UiState>(initialUiState);
  const [staticSensors, setStaticSensors] = useState<Sensor[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  // Load ALL sensors for the map on mount (Token free)
  useEffect(() => {
    fetchSensors().then(setStaticSensors).catch(console.error);
  }, []);

  useEffect(() => {
    if (uiState.corridor === "Statewide" || uiState.chartMode === "latest") return;
    
    // If the time range is 'now' or 'last_1h', the agent's initial response 
    // already contains the best 'live' evidence via backend fallback logic.
    // Re-fetching here with a browser-generated timestamp often leads to empty data
    // because the database may contain 'future' dates (e.g. 2026) while the browser is in the present.
    if (uiState.timeRange === "now" || uiState.timeRange === "last_1h") return;

    let ignore = false;
    setIsLoadingHistory(true);
    const range = resolveTimeRange(uiState.timeRange);

    fetchCorridorHistory(uiState.corridor, {
      startAt: range.startAt,
      endAt: range.endAt,
      bucket: "5m",
    })
      .then((history) => {
        if (ignore) return;
        setResult((previous) => ({ ...previous, chart: history.chart }));
      })
      .catch(console.error)
      .finally(() => {
        if (!ignore) setIsLoadingHistory(false);
      });

    return () => {
      ignore = true;
    };
  }, [uiState.corridor, uiState.timeRange, uiState.chartMode]);

  const handleNewResult = (data: TrafficQueryResponse, userMessage: string) => {
    setResult(data);
    setUiState((previous) => applyUiActions(previous, data));
    setLastQuestion(userMessage);
  };

  const handleFollowUp = (message: string) => {
    setLastQuestion(message);
    const normalized = message.toLowerCase();
    if (normalized.includes("yesterday")) {
      setUiState((previous) => ({
        ...previous,
        timeRange: "yesterday",
        chartMode: previous.corridor === "Statewide" ? "latest" : "comparison",
      }));
      return;
    }
    if (normalized.includes("affected sensor")) {
      setUiState((previous) => ({
        ...previous,
        chartMode: previous.corridor === "Statewide" ? "latest" : "history",
      }));
    }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">FlowOps</h1>
            <p className="mt-1 text-sm text-road/60">
              Ask a traffic question. The evidence will arrange itself around the answer.
            </p>
          </div>
          <div className="rounded-md border border-road/10 bg-white px-3 py-2 text-xs text-road/60">
            VDOT SmarterRoads · live network
          </div>
        </header>

        <CommandBar onNewQuery={handleNewResult} />

        <TrafficControls
          uiState={uiState}
          isLoadingHistory={isLoadingHistory}
          onChange={(next) => setUiState((previous) => ({ ...previous, ...next }))}
        />

        <TrafficStory
          result={result}
          uiState={uiState}
          lastQuestion={lastQuestion}
          onFollowUp={handleFollowUp}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(420px,0.95fr)_minmax(520px,1.05fr)]">
          <SpeedChart data={result.chart} corridor={uiState.corridor} timeRange={uiState.timeRange} />
          <MapPanel
            sensors={staticSensors}
            incidents={result.incidents}
            highlightedSensorIds={uiState.highlightedSensorIds}
            mapFocus={uiState.mapFocus}
          />
        </div>
      </div>
    </main>
  );
}

function applyUiActions(previous: UiState, result: TrafficQueryResponse): UiState {
  return (result.ui_actions ?? []).reduce<UiState>((state, action) => {
    if (action.type === "set_corridor" && typeof action.value === "string") {
      return { ...state, corridor: action.value };
    }
    if (action.type === "set_time_range" && typeof action.value === "string") {
      return { ...state, timeRange: action.value };
    }
    if (
      action.type === "set_chart_mode" &&
      (action.value === "latest" || action.value === "history" || action.value === "comparison")
    ) {
      return { ...state, chartMode: action.value };
    }
    if (action.type === "highlight_sensors" && Array.isArray(action.value)) {
      return { ...state, highlightedSensorIds: action.value };
    }
    if (action.type === "highlight_incidents" && Array.isArray(action.value)) {
      return { ...state, highlightedIncidentIds: action.value };
    }
    if (action.type === "focus_map" && !Array.isArray(action.value) && typeof action.value !== "string") {
      const latitude = Number(action.value.latitude);
      const longitude = Number(action.value.longitude);
      const zoom = Number(action.value.zoom);
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(zoom)) {
        return { ...state, mapFocus: { center: [latitude, longitude], zoom } };
      }
    }
    return state;
  }, previous);
}

function resolveTimeRange(value: string) {
  const now = new Date();
  const endAt = now.toISOString();
  const start = new Date(now);

  if (value === "last_7d") {
    start.setDate(start.getDate() - 7);
    return { startAt: start.toISOString(), endAt };
  }
  if (value === "yesterday") {
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { startAt: yesterdayStart.toISOString(), endAt: yesterdayEnd.toISOString() };
  }
  if (value === "today") {
    start.setHours(0, 0, 0, 0);
    return { startAt: start.toISOString(), endAt };
  }

  start.setHours(start.getHours() - 1);
  return { startAt: start.toISOString(), endAt };
}
