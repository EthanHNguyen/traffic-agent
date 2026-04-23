import type { UiState } from "@/lib/types";
import { formatTimeRange } from "./AnswerCard";

type TrafficControlsProps = {
  uiState: UiState;
  onChange: (next: Partial<UiState>) => void;
  isLoadingHistory: boolean;
};

const corridors = ["Statewide", "I-95", "I-95 S", "I-95 N", "I-66", "I-66 E", "I-66 W", "VA-28", "VA-28 N", "VA-28 S", "US-29"];
export default function TrafficControls({
  uiState,
  onChange,
  isLoadingHistory,
}: TrafficControlsProps) {
  // Ensure the current corridor is in the list even if not hardcoded
  const activeCorridors = corridors.includes(uiState.corridor) 
    ? corridors 
    : [uiState.corridor, ...corridors];

  return (
    <section className="rounded-lg border border-road/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-36 flex-1 text-xs font-semibold uppercase tracking-wide text-road/60">
          Corridor
          <select
            value={uiState.corridor}
            onChange={(event) =>
              onChange({
                corridor: event.target.value,
                timeRange: "last_1h",
                chartMode: event.target.value === "Statewide" ? "latest" : "history",
              })
            }
            className="mt-1 w-full rounded-md border border-road/15 bg-white px-3 py-2 text-sm normal-case tracking-normal text-ink focus:border-mile outline-none transition"
          >
            {activeCorridors.map((corridor) => (
              <option key={corridor} value={corridor}>
                {corridor}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-md border border-road/10 px-3 py-2 text-xs text-road/60 min-w-48 text-center bg-mist/30">
          {isLoadingHistory ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-3 w-3 text-road/40" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Updating evidence...
            </span>
          ) : (
            <span className="font-medium">{uiState.corridor} · {formatTimeRange(uiState.timeRange)}</span>
          )}
        </div>
      </div>
    </section>
  );
}
