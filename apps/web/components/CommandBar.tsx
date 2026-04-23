"use client";

import { FormEvent, useState } from "react";
import { queryTraffic } from "@/lib/api";
import type { TrafficQueryResponse } from "@/lib/types";

type CommandBarProps = {
  onNewQuery: (result: TrafficQueryResponse, userMessage: string) => void;
};

const promptChips = [
  "Worst slowdowns statewide",
  "How is I-95 south?",
  "Any incidents near Richmond?",
];

export default function CommandBar({ onNewQuery }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuestion(input);
  }

  async function submitQuestion(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || isLoading) return;

    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const result = await queryTraffic(message);
      onNewQuery(result, message);
    } catch {
      setError("Traffic API request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className="rounded-lg border border-road/10 bg-white p-3 shadow-sm"
    >
      <label htmlFor="traffic-question" className="sr-only">
        Traffic question
      </label>
      <div className="flex gap-2">
        <input
          id="traffic-question"
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-road/15 bg-white px-3 py-2 text-sm outline-none ring-mile/30 transition focus:border-mile focus:ring-4"
          placeholder="Ask about a commute, corridor, or slowdown..."
        />
        <button
          type="submit"
          disabled={isLoading || input.trim().length === 0}
          aria-busy={isLoading}
          className="rounded-md bg-mile px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-mile/90 disabled:cursor-not-allowed disabled:bg-road/30 flex items-center gap-2"
        >
          {isLoading && (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isLoading ? "Asking" : "Ask"}
        </button>
      </div>
      {isLoading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-mile animate-pulse font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-mile"></span>
          Agent thinking... analyzing VDOT network evidence...
        </div>
      )}
      <span role="alert" className="mt-2 block min-h-4 text-xs text-brake">
        {error}
      </span>
      <div className="flex flex-wrap gap-2">
        {promptChips.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => submitQuestion(prompt)}
            disabled={isLoading}
            className="rounded-md border border-road/10 px-3 py-1.5 text-xs font-medium text-road/70 transition hover:border-mile hover:text-mile disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </form>
  );
}
