import type { TrafficQueryResponse, UiState } from "@/lib/types";
import FormattedText from "./FormattedText";
import { formatTimeRange } from "./AnswerCard";

type TrafficStoryProps = {
  result: TrafficQueryResponse;
  uiState: UiState;
  lastQuestion: string | null;
  onFollowUp: (message: string) => void;
};

export default function TrafficStory({
  result,
  uiState,
  lastQuestion,
  onFollowUp,
}: TrafficStoryProps) {
  const latestPoint = result.chart[result.chart.length - 1];
  const speed = latestPoint ? Math.round(latestPoint.speed_mph) : null;
  const typical = latestPoint ? Math.round(latestPoint.baseline_mph) : null;
  const delta = speed !== null && typical !== null ? speed - typical : null;
  const isBaselineFallback = speed === typical && speed !== null;

  const relevantSensorCount = result.sensors.length;
  const eventCount = result.incidents.length;
  
  let impact = "Awaiting live speed evidence";
  if (delta !== null) {
    if (delta === 0) {
      impact = isBaselineFallback ? "Typical baseline unavailable" : "Matching typical speeds";
    } else {
      impact = `${Math.abs(delta)} mph ${delta < 0 ? "slower" : "faster"} than typical`;
    }
  }

  const headline =
    delta === null
      ? "Ask about a commute to focus the evidence"
      : delta === 0
      ? `${uiState.corridor} is moving at typical speeds`
      : `${uiState.corridor} is ${Math.abs(delta)} mph ${delta < 0 ? "slower" : "faster"} than typical`;

  return (
    <section
      aria-label="Traffic story"
      className="rounded-lg border border-road/10 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-road/50">
            Traffic Story
          </h2>
          <h3 className="mt-1 text-2xl font-semibold text-ink">{headline}</h3>
          <p className="mt-1 text-sm text-road/60">{formatTimeRange(uiState.timeRange)}</p>
        </div>
        <div className="rounded-md border border-road/10 px-3 py-2 text-xs text-road/60">
          Based on {relevantSensorCount || "available"} recent VDOT reading
          {relevantSensorCount === 1 ? "" : "s"} and {eventCount} nearby event
          {eventCount === 1 ? "" : "s"}
        </div>
      </div>

      {lastQuestion && (
        <p className="mb-3 text-xs font-medium text-road/45">Asked: {lastQuestion}</p>
      )}

      {lastQuestion && (
        <div className="mb-4 rounded-md border border-mile/20 bg-mile/5 px-3 py-2 text-xs text-mile">
          FlowOps focused the evidence on {uiState.corridor}, highlighted {uiState.highlightedSensorIds.length} affected sensor{uiState.highlightedSensorIds.length === 1 ? "" : "s"}, and checked {eventCount} nearby event{eventCount === 1 ? "" : "s"}.
        </div>
      )}

      <div className="text-ink mb-6">
        <FormattedText text={result.answer} />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Metric label="Latest Speed" value={speed !== null ? `${speed} mph` : "--"} />
        <Metric 
          label="Typical" 
          value={typical !== null ? `${typical} mph` : "--"} 
          subValue={isBaselineFallback ? "No baseline data" : undefined}
        />
        <Metric label="Likely Impact" value={impact} />
        <Metric label="Status" value={result.anomaly_detected ? "Anomaly Detected" : "Within threshold"} />
      </div>

      {(result.follow_ups?.length ?? 0) > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
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

function Metric({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-md border border-road/10 bg-mist px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-road/50">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
      {subValue && <p className="text-[9px] text-road/40 italic">{subValue}</p>}
    </div>
  );
}
