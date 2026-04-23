export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Sensor = {
  id: string;
  name: string;
  corridor: string;
  direction: string;
  mile_marker: number | null;
  location: Coordinate;
};

export type Incident = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  corridor: string;
  starts_at: string;
  ends_at: string | null;
  location: Coordinate;
};

export type ChartPoint = {
  timestamp: string;
  speed_mph: number;
  baseline_mph: number;
};

export type SensorReading = {
  place_id: string;
  observed_at: string;
  speed_mph: number;
  volume_vph: number;
  occupancy_pct: number;
};

export type UiAction = {
  type:
    | "set_corridor"
    | "set_time_range"
    | "set_chart_mode"
    | "highlight_sensors"
    | "highlight_incidents"
    | "focus_map";
  value: string | string[] | Record<string, number | string>;
};

export type TrafficQueryResponse = {
  answer: string;
  sql: string | null;
  chart: ChartPoint[];
  sensors: Sensor[];
  incidents: Incident[];
  anomaly_detected: boolean;
  latency_ms: number;
  ui_actions?: UiAction[];
  follow_ups?: string[];
};

export type CorridorHistoryResponse = {
  corridor: string;
  bucket: string;
  chart: ChartPoint[];
};

export type UiState = {
  corridor: string;
  timeRange: string;
  chartMode: "latest" | "history" | "comparison";
  highlightedSensorIds: string[];
  highlightedIncidentIds: string[];
  mapFocus: {
    center: [number, number];
    zoom: number;
  };
};
