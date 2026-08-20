"use client";

import type { Turn } from "@/lib/types";

const TIER_COLOR: Record<string, string> = {
  strong: "var(--strong)",
  weak: "var(--weak)",
  unknown: "var(--muted)",
};

const fmtMs = (v: number | null) => (v === null ? "-" : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v}ms`);

/**
 * The teaching centrepiece: for one turn, shows which target won, the router's
 * rationale, and the cost/latency of that choice.
 */
export function DecisionPanel({ turn }: { turn: Turn }) {
  const d = turn.decision;
  const tier = turn.tier;
  const color = TIER_COLOR[tier] ?? TIER_COLOR.unknown;

  const tierLabel =
    tier === "strong" ? "STRONG" : tier === "weak" ? "WEAK" : turn.streaming ? "ROUTING..." : "TIER UNKNOWN";

  const model = d?.selectedModel ?? null;
  const usage = turn.usage;
  const hasRoutingHeaders = d ? Object.keys(d.raw).length > 0 : false;

  return (
    <div className="decision" style={{ ["--tier" as any]: color }}>
      <div className="d-top">
        <span className="tier-badge">{tierLabel}</span>
        <span className="mono-sm">{model ?? "resolving target..."}</span>
        {d?.selectedTarget && <span className="pill">target: {d.selectedTarget}</span>}
        {d?.escalated === true && <span className="pill bad">escalated</span>}
        {typeof d?.score === "number" && <span className="pill">score {d.score.toFixed(3)}</span>}
        <span className="spacer" />
        <span className="mono-sm">{turn.routeId}</span>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="m-label">First token</div>
          <div className="m-value">{fmtMs(turn.ttftMs)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Total</div>
          <div className="m-value">{fmtMs(turn.totalMs)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Prompt tok</div>
          <div className="m-value">{usage?.prompt_tokens ?? "-"}</div>
        </div>
        <div className="metric">
          <div className="m-label">Completion tok</div>
          <div className="m-value">{usage?.completion_tokens ?? "-"}</div>
        </div>
        <div className="metric">
          <div className="m-label">Total tok</div>
          <div className="m-value">{usage?.total_tokens ?? "-"}</div>
        </div>
        <div className="metric">
          <div className="m-label">Finish</div>
          <div className="m-value">{turn.finishReason ?? (turn.streaming ? "streaming" : "-")}</div>
        </div>
        <div className="metric">
          <div className="m-label">Session</div>
          <div className="m-value">{turn.sessionId ?? "none"}</div>
        </div>
      </div>

      {d?.rationale && (
        <div className="rationale">
          <span className="r-label">Router rationale</span>
          {d.rationale}
        </div>
      )}

      {d && !hasRoutingHeaders && !turn.streaming && (
        <div className="no-headers">
          No <code>x-switchyard-*</code> headers on this response. The tier above was inferred from the
          resolved model id in the stream. Compare with <code>curl -s $SWITCHYARD/v1/stats</code> or the
          router&apos;s own log line for this request.
        </div>
      )}

      {d && hasRoutingHeaders && (
        <details className="raw">
          <summary>Raw routing headers ({Object.keys(d.raw).length})</summary>
          <pre>{Object.entries(d.raw).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
