"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { useMap } from "react-leaflet";
import { Sensor, Incident, SensorReading } from "../lib/types";
import { fetchLatestReading } from "@/lib/api";

const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((mod) => mod.CircleMarker), { ssr: false });
const MarkerClusterGroup = dynamic(() => import("react-leaflet-cluster"), { ssr: false });

function SensorMarker({ sensor }: { sensor: Sensor }) {
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLatestReading(sensor.id);
      setReading(data);
    } catch {
      setReading(null);
      setError("Live telemetry unavailable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Marker 
      position={[sensor.location.latitude, sensor.location.longitude]}
      eventHandlers={{ click: handleClick }}
    >
      <Popup>
        <div className="text-xs min-w-[140px]">
          <div className="font-bold border-b border-road/10 pb-1 mb-2">{sensor.name}</div>
          {loading ? (
            <div className="animate-pulse py-1">Fetching live telemetry...</div>
          ) : error ? (
            <div role="alert" className="py-1 text-brake">{error}</div>
          ) : reading ? (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-road/60">Speed:</span>
                <span className="font-semibold text-ink">{reading.speed_mph} mph</span>
              </div>
              <div className="flex justify-between">
                <span className="text-road/60">Volume:</span>
                <span className="font-semibold text-ink">{reading.volume_vph} vph</span>
              </div>
              <div className="flex justify-between">
                <span className="text-road/60">Occupancy:</span>
                <span className="font-semibold text-ink">{reading.occupancy_pct}%</span>
              </div>
              <div className="text-[9px] text-road/40 pt-1 mt-1 border-t border-road/5">
                Observed: {new Date(reading.observed_at).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="text-road/60 italic text-center">Click to load live data</div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

interface MapPanelProps {
  sensors: Sensor[];
  incidents: Incident[];
  highlightedSensorIds?: string[];
  mapFocus: {
    center: [number, number];
    zoom: number;
  };
}

function MapFocusController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom, { animate: false });
    setTimeout(() => {
      map.invalidateSize();
    }, 0);
  }, [center, map, zoom]);

  return null;
}

export default function MapPanel({
  sensors,
  incidents,
  highlightedSensorIds = [],
  mapFocus,
}: MapPanelProps) {
  const [isMounted, setIsMounted] = useState(false);
  const highlightedSensorSet = new Set(highlightedSensorIds);
  const highlightedSensors = sensors.filter((sensor) => highlightedSensorSet.has(sensor.id));

  useEffect(() => {
    setIsMounted(true);
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
      });
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 500);
    });
  }, []);

  if (!isMounted) return <div style={{ height: "450px" }} className="w-full bg-slate-100 flex items-center justify-center">Loading Map Engine...</div>;

  return (
    <section className="rounded-lg border border-road/10 bg-white p-4 shadow-sm">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-road">Map Evidence</h2>
        <span
          aria-label="Sensor count"
          className="text-[10px] bg-mile/10 text-mile px-2 py-0.5 rounded-full font-bold"
        >
          {sensors.length} SENSORS SHOWN
        </span>
      </div>
      <p className="mb-3 text-xs text-road/60">
        Showing full network in background · Relevant sensors are ringed · Unrelated sensors muted in the background
      </p>
      {highlightedSensorIds.length > 0 && (
        <p className="mb-3 text-xs text-road/60">
          {highlightedSensorIds.length} affected sensor{highlightedSensorIds.length === 1 ? "" : "s"}
          {incidents.length > 0 ? ` · ${incidents.length} likely cause${incidents.length === 1 ? "" : "s"} nearby` : ""}
        </p>
      )}
      {incidents.length > 0 && (
        <div className="mb-3 space-y-1 rounded-md border border-brake/15 bg-brake/5 px-3 py-2">
          {incidents.slice(0, 3).map((incident) => (
            <p key={incident.id} className="text-xs font-medium text-brake">
              {incident.title}
            </p>
          ))}
        </div>
      )}
      <span aria-label="Map zoom" className="sr-only">Zoom {mapFocus.zoom}</span>
      <span aria-label="Map center" className="sr-only">
        {mapFocus.center[0].toFixed(4)}, {mapFocus.center[1].toFixed(4)}
      </span>
      <div style={{ height: "450px", width: "100%" }} className="overflow-hidden rounded-md border border-road/10">
        <MapContainer 
          center={mapFocus.center} 
          zoom={mapFocus.zoom} 
          style={{ height: "100%", width: "100%" }}
        >
          <MapFocusController center={mapFocus.center} zoom={mapFocus.zoom} />
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
            {sensors.map((sensor) => (
              <SensorMarker key={sensor.id} sensor={sensor} />
            ))}
          </MarkerClusterGroup>
          {highlightedSensors.map((sensor) => (
            <CircleMarker
              key={`highlight-${sensor.id}`}
              center={[sensor.location.latitude, sensor.location.longitude]}
              radius={14}
              pathOptions={{
                color: "#2f7d6d",
                fillColor: "#2f7d6d",
                fillOpacity: 0.18,
                opacity: 0.95,
                weight: 3,
              }}
            />
          ))}
          {incidents.map((incident) => (
            <Marker key={incident.id} position={[incident.location.latitude, incident.location.longitude]}>
              <Popup>
                <div className="text-xs font-bold text-brake">
                  {incident.title}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
