"use client";

import { FormEvent, useState } from "react";
import { queryTraffic } from "@/lib/api";
import type { TrafficQueryResponse } from "@/lib/types";
import FormattedText from "./FormattedText";

type Message = {
  role: "user" | "agent";
  content: string;
};

type ChatPanelProps = {
  messages: Message[];
  onNewQuery: (result: TrafficQueryResponse, userMessage: string) => void;
};

export default function ChatPanel({ messages, onNewQuery }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
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
    <section className="flex min-h-[calc(100vh-3rem)] flex-col rounded-lg border border-road/10 bg-white shadow-sm">
      <div className="border-b border-road/10 p-4">
        <h1 className="text-xl font-semibold text-ink">Command Panel</h1>
        <p className="mt-1 text-sm text-road/65">Corridor Intelligence</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-road px-4 py-3 text-sm text-white"
                : "mr-auto max-w-[90%] rounded-lg bg-mist px-4 py-3 text-sm leading-6 text-road"
            }
          >
            <FormattedText text={message.content} />
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-road/10 p-4">
        <label htmlFor="traffic-question" className="sr-only">Traffic question</label>
        <textarea
          id="traffic-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }
          }}
          rows={3}
          className="w-full resize-none rounded-md border border-road/15 bg-white p-3 text-sm outline-none ring-mile/30 transition focus:border-mile focus:ring-4"
          placeholder="Ask FlowOps..."
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span role="alert" className="min-h-4 text-xs text-brake">
            {error}
          </span>
          <button
            type="submit"
            disabled={isLoading || input.trim().length === 0}
            aria-busy={isLoading}
            className="rounded-md bg-mile px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-mile/90 disabled:cursor-not-allowed disabled:bg-road/30"
          >
            {isLoading ? "Querying" : "Ask"}
          </button>
        </div>
      </form>
    </section>
  );
}
