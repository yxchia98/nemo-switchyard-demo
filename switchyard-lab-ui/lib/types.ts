export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface DecisionEvent {
  selectedModel: string | null;
  selectedTarget: string | null;
  rationale: string | null;
  score: number | null;
  route: string | null;
  escalated: boolean | null;
  raw: Record<string, string>;
  requestedRoute?: string;
  sessionId?: string | null;
  source?: string;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** One assistant turn plus everything observed about how it was routed. */
export interface Turn {
  id: string;
  routeId: string;
  sessionId: string | null;
  prompt: string;
  answer: string;
  decision: DecisionEvent | null;
  usage: Usage | null;
  ttftMs: number | null;
  totalMs: number | null;
  finishReason: string | null;
  tier: "strong" | "weak" | "unknown";
  error: string | null;
  streaming: boolean;
  startedAt: number;
}
