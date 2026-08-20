"use client";

import { useCallback, useRef, useState } from "react";
import { tierForModel } from "./routes";
import type { ChatMessage, DecisionEvent, Turn, Usage } from "./types";

let seq = 0;
const nextId = () => `turn-${Date.now()}-${seq++}`;

/**
 * Drives one streaming request against /api/chat and folds the multiplexed SSE
 * events (decision / delta / usage / done / error) into a Turn record.
 */
export function useSwitchyardChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, next: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...next } : t)));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setBusy(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
  }, []);

  const send = useCallback(
    async (opts: {
      prompt: string;
      routeId: string;
      sessionId: string;
      systemPrompt: string;
      temperature: number;
      /** Send prior turns so stage/escalation routes have a window to read. */
      includeHistory: boolean;
      history: Turn[];
    }) => {
      const { prompt, routeId, sessionId, systemPrompt, temperature, includeHistory, history } = opts;
      const id = nextId();

      setTurns((prev) => [
        ...prev,
        {
          id,
          routeId,
          sessionId: sessionId || null,
          prompt,
          answer: "",
          decision: null,
          usage: null,
          ttftMs: null,
          totalMs: null,
          finishReason: null,
          tier: "unknown",
          error: null,
          streaming: true,
          startedAt: Date.now(),
        },
      ]);
      setBusy(true);

      const messages: ChatMessage[] = [];
      if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt.trim() });
      if (includeHistory) {
        for (const t of history) {
          if (t.error) continue;
          messages.push({ role: "user", content: t.prompt });
          if (t.answer) messages.push({ role: "assistant", content: t.answer });
        }
      }
      messages.push({ role: "user", content: prompt });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: routeId,
            messages,
            sessionId: sessionId || null,
            temperature,
          }),
          signal: controller.signal,
        });

        if (!res.body) throw new Error("No response body from /api/chat.");

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buffer = "";
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            let event = "message";
            let data = "";
            for (const line of frame.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;

            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            if (event === "decision") {
              const d = parsed as DecisionEvent;
              patch(id, { decision: d, tier: tierForModel(d.selectedModel) });
            } else if (event === "first_token") {
              patch(id, { ttftMs: parsed.ttftMs ?? null });
            } else if (event === "delta") {
              answer += parsed.text ?? "";
              patch(id, { answer });
            } else if (event === "usage") {
              patch(id, { usage: parsed as Usage });
            } else if (event === "done") {
              patch(id, {
                totalMs: parsed.totalMs ?? null,
                ttftMs: parsed.ttftMs ?? null,
                finishReason: parsed.finishReason ?? null,
                streaming: false,
                ...(parsed.resolvedModel ? { tier: tierForModel(parsed.resolvedModel) } : {}),
              });
            } else if (event === "error") {
              patch(id, { error: parsed.message ?? "Unknown error.", streaming: false });
            }
          }
        }

        patch(id, { streaming: false });
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        patch(id, {
          streaming: false,
          error: aborted ? "Cancelled." : err instanceof Error ? err.message : String(err),
        });
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [patch],
  );

  return { turns, busy, send, stop, reset };
}
