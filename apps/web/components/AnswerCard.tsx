import type { TrafficQueryResponse, UiState } from "@/lib/types";
import FormattedText from "./FormattedText";

type AnswerCardProps = {
  result: TrafficQueryResponse;
  uiState: UiState;
  onFollowUp: (message: string) => void;
};

export default function AnswerCard({ result, uiState, onFollowUp }: AnswerCardProps) {
  if (!result.answer) return null;

  const latestPoint = result.chart[result.chart.length - 1];
  const delta = latestPoint ? Math.round(latestPoint.speed_mph - latestPoint.baseline_mph) : null;
  const impact = delta === null ? "Awaiting speed data" : `${Math.abs(delta)} mph ${delta < 0 ? "slower" : "faster"} than typical`;

  return (
    <section aria-label="Agent brief" className="rounded-lg border border-road/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-road">Agent Brief</h2>
          <p className="mt-1 text-xs text-road/60">
            {uiState.corridor} · {formatTimeRange(uiState.timeRange)}
          </p>
        </div>
        <span className="rounded-md border border-road/10 px-2 py-1 text-xs font-medium text-road/70">
          {result.latency_ms} ms
        </span>
      </div>

      <div className="text-ink">
        <FormattedText text={result.answer} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Latest Speed" value={latestPoint ? `${latestPoint.speed_mph} mph` : "--"} />
        <Metric label="Likely Impact" value={impact} />
        <Metric label="Sensors Shown" value={`${result.sensors.length}`} />
      </div>

      {(result.follow_ups?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.follow_ups?.map((followUp) => (
            <button
              key={followUp}
              type="button"
              onClick={() => onFollowUp(followUp)}
              className="rounded-md border border-road/10 px-3 py-1.5 text-xs font-medium text-road transition hover:border-mile hover:text-mile"
            >
              {followUp}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-road/10 bg-mist px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-road/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

export function formatTimeRange(value: string) {
  const labels: Record<string, string> = {
    last_1h: "Past hour",
    last_7d: "Past 7 days",
    today: "Today",
    yesterday: "Yesterday",
    now: "Live now",
  };
  return labels[value] ?? value;
}
