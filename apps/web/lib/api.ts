import type { CorridorHistoryResponse, Sensor, TrafficQueryResponse } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function queryTraffic(message: string): Promise<TrafficQueryResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(`${API_BASE_URL}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Traffic API returned ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function fetchLatestReading(sensorId: string) {
  const response = await fetch(`${API_BASE_URL}/api/sensors/${encodeURIComponent(sensorId)}/latest`);
  if (!response.ok) throw new Error("Reading not found");
  return response.json();
}

export async function fetchSensors(): Promise<Sensor[]> {
  const response = await fetch(`${API_BASE_URL}/api/sensors`);
  if (!response.ok) throw new Error("Failed to fetch sensors");
  return response.json();
}

export async function fetchCorridorHistory(
  corridor: string,
  options: { startAt?: string; endAt?: string; bucket?: string } = {},
): Promise<CorridorHistoryResponse> {
  const params = new URLSearchParams();
  params.set("bucket", options.bucket ?? "5m");
  if (options.startAt) params.set("start_at", options.startAt);
  if (options.endAt) params.set("end_at", options.endAt);

  const response = await fetch(
    `${API_BASE_URL}/api/corridors/${encodeURIComponent(corridor)}/history?${params}`,
  );
  if (!response.ok) throw new Error("Failed to fetch corridor history");
  return response.json();
}
