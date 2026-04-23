"use client";

import { ChartPoint } from "../lib/types";
import { formatTimeRange } from "./AnswerCard";

interface SpeedChartProps {
  data: ChartPoint[];
  corridor: string;
  timeRange: string;
}

export default function SpeedChart({ data, corridor, timeRange }: SpeedChartProps) {
  if (!data || data.length === 0) {
    return (
      <section className="rounded-lg border border-road/10 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-road">
            How Traffic Changed
          </h2>
          <p className="mt-1 text-xs text-road/55">
            {corridor} · {formatTimeRange(timeRange)}
          </p>
        </div>
        <div className="flex h-56 w-full items-center justify-center rounded-md bg-mist text-sm text-road/50">
          No speed data available
        </div>
      </section>
    );
  }

  const width = 640;
  const height = 220;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxSpeed = 75; // Locked for consistency

  const getX = (index: number) => padding + (index * chartWidth) / (data.length - 1 || 1);
  const getY = (speed: number) => height - padding - (speed * chartHeight) / maxSpeed;

  const observedPoints = data.map((p, i) => `${getX(i)},${getY(p.speed_mph)}`).join(" ");
  const baselinePoints = data.map((p, i) => `${getX(i)},${getY(p.baseline_mph)}`).join(" ");
  const lowestPoint = data.reduce((lowest, point) => (
    point.speed_mph < lowest.speed_mph ? point : lowest
  ), data[0]);
  const latestPoint = data[data.length - 1];

  const timeLabels = data.filter((_, i) => {
    if (data.length <= 5) return true;
    const step = Math.floor(data.length / 4);
    return i % step === 0 || i === data.length - 1;
  }).slice(0, 5);

  return (
    <section className="rounded-lg border border-road/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-road">
            How Traffic Changed
          </h2>
          <p className="mt-1 text-xs text-road/55">
            {corridor} · {formatTimeRange(timeRange)}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-road/70">
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-mile"></i> Observed
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-signal"></i> Baseline
          </span>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs text-road/60">
        <span className="rounded-md bg-mist px-2 py-1">Lowest point: {lowestPoint.speed_mph} mph</span>
        <span className="rounded-md bg-mist px-2 py-1">Typical reference: {latestPoint.baseline_mph} mph</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible">
        {/* Grid lines */}
        {[0, 25, 45, 65].map((s) => (
          <g key={s}>
            <line
              x1={padding}
              x2={width - padding}
              y1={getY(s)}
              y2={getY(s)}
              stroke="#d9dee5"
              strokeDasharray={s === 45 ? "0" : "4 4"}
            />
            <text x={padding - 30} y={getY(s) + 4} className="fill-road/40 text-[10px]">
              {s}
            </text>
          </g>
        ))}

        {/* Baseline Line */}
        <polyline
          fill="none"
          stroke="#e5b343"
          strokeWidth="2"
          strokeDasharray="5 5"
          points={baselinePoints}
        />

        {/* Observed Line */}
        <polyline
          fill="none"
          stroke="#2f7d6d"
          strokeWidth="3"
          strokeLinecap="round"
          points={observedPoints}
        />

        {/* Interaction Points */}
        {data.map((p, i) => (
          <circle key={i} cx={getX(i)} cy={getY(p.speed_mph)} r="3" fill="#2f7d6d">
            <title>{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: {p.speed_mph} mph</title>
          </circle>
        ))}

        {/* X-Axis Time Labels */}
        {timeLabels.map((p, i) => {
          const originalIndex = data.indexOf(p);
          return (
            <text
              key={i}
              x={getX(originalIndex)}
              y={height - padding + 20}
              textAnchor={i === 0 ? "start" : i === timeLabels.length - 1 ? "end" : "middle"}
              className="fill-road/40 text-[9px] font-medium"
            >
              {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </text>
          );
        })}
      </svg>
    </section>
  );
}
