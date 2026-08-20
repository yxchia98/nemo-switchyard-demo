/**
 * Server-side Switchyard client helpers.
 *
 * Nothing in this file is importable from a client component: it reads
 * process.env and is only used inside app/api/* route handlers.
 */

export interface SwitchyardDecision {
  /** Upstream model that actually served the turn, e.g. nvidia/nemotron-3.5-lightning:free */
  selectedModel: string | null;
  /** Semantic target name when the router exposes it, e.g. "weak" */
  selectedTarget: string | null;
  /** Human readable reason the router logged for this pick. */
  rationale: string | null;
  /** Classifier confidence / score when present. */
  score: number | null;
  /** Route id echoed back by the router. */
  route: string | null;
  /** Whether the router reported an escalation for this turn. */
  escalated: boolean | null;
  /** Every x-switchyard-* / x-sy-* header, verbatim, for the raw panel. */
  raw: Record<string, string>;
}

export function baseUrl(): string {
  return (process.env.SWITCHYARD_BASE_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
}

export function upstreamHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("content-type", "application/json");
  const key = process.env.SWITCHYARD_API_KEY;
  // switchyard-server does not require client auth; a placeholder keeps
  // strict OpenAI-style clients and any fronting gateway happy.
  h.set("authorization", `Bearer ${key && key.length > 0 ? key : "switchyard-lab"}`);
  return h;
}

export function timeoutMs(): number {
  const n = Number(process.env.SWITCHYARD_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 180_000;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Switchyard records the selected model and a rationale on the response.
 * Header naming has moved around across pre-alpha builds, so we collect every
 * routing-ish header and resolve fields from a list of candidates rather than
 * hardcoding one spelling.
 */
export function parseDecision(headers: Headers): SwitchyardDecision {
  const raw: Record<string, string> = {};
  headers.forEach((value, name) => {
    const n = name.toLowerCase();
    if (
      n.startsWith("x-switchyard") ||
      n.startsWith("x-sy-") ||
      n.startsWith("x-route") ||
      n.startsWith("x-model") ||
      n.startsWith("x-target") ||
      n.startsWith("x-selected") ||
      n.startsWith("x-decision") ||
      n.startsWith("x-request-id") ||
      n.startsWith("x-nemo")
    ) {
      raw[n] = value;
    }
  });

  const pick = (...names: string[]): string | null => {
    for (const n of names) {
      const direct = headers.get(n);
      if (direct) return direct;
    }
    // Fall back to a loose suffix match over the collected routing headers.
    for (const n of names) {
      const tail = n.replace(/^x-(switchyard|sy|nemo)-/, "");
      for (const [k, v] of Object.entries(raw)) {
        if (k.endsWith(tail) && v) return v;
      }
    }
    return null;
  };

  const scoreRaw = pick(
    "x-switchyard-score",
    "x-switchyard-confidence",
    "x-sy-score",
    "x-decision-score",
  );
  const escalatedRaw = pick(
    "x-switchyard-escalated",
    "x-switchyard-escalation",
    "x-sy-escalated",
  );

  return {
    selectedModel: pick(
      "x-switchyard-selected-model",
      "x-switchyard-model",
      "x-selected-model",
      "x-model-id",
      "x-sy-model",
    ),
    selectedTarget: pick(
      "x-switchyard-selected-target",
      "x-switchyard-target",
      "x-selected-target",
      "x-target",
      "x-sy-target",
    ),
    rationale: pick(
      "x-switchyard-rationale",
      "x-switchyard-reason",
      "x-switchyard-decision-rationale",
      "x-decision-rationale",
      "x-sy-rationale",
    ),
    score: scoreRaw && NUMERIC.test(scoreRaw.trim()) ? Number(scoreRaw) : null,
    route: pick("x-switchyard-route", "x-route-id", "x-route", "x-sy-route"),
    escalated:
      escalatedRaw === null ? null : /^(1|true|yes)$/i.test(escalatedRaw.trim()),
    raw,
  };
}

/** Extract a usable error message from a non-2xx upstream response body. */
export function describeUpstreamError(status: number, body: string): string {
  let detail = body.slice(0, 600);
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || parsed?.message || parsed?.detail || detail;
  } catch {
    /* body was not JSON - keep the truncated text */
  }
  if (status === 404 && /route/i.test(detail)) {
    return `${detail} - the model id in the request does not match any route id in routes.toml. Run switchyard-server --config routes.toml --dry-run to list valid routes.`;
  }
  if (status === 401 || status === 403) {
    return `${detail} - check that OPENROUTER_API_KEY was exported in the shell that started switchyard-server.`;
  }
  return detail || `Switchyard returned HTTP ${status}.`;
}
