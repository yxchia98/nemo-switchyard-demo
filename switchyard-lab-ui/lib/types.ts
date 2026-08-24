export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatContentPart[];
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
  images: ImageAttachment[];
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
