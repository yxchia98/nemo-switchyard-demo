"use client";

export interface HealthState {
  ok: boolean;
  status: number;
  latencyMs?: number;
  baseUrl?: string;
  error?: string;
}

/** Health + /v1/models discovery indicators, refreshed on load and on demand. */
export function StatusBar({
  health,
  registeredIds,
  checking,
  onRefresh,
}: {
  health: HealthState | null;
  registeredIds: string[];
  checking: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <span className={`pill ${health?.ok ? "ok" : health ? "bad" : ""}`} title={health?.error ?? ""}>
        <i className="dot" />
        {checking
          ? "checking router..."
          : health?.ok
            ? `router up${health.latencyMs !== undefined ? ` (${health.latencyMs}ms)` : ""}`
            : "router unreachable"}
      </span>

      <span className="pill brand" title={registeredIds.join("\n")}>
        {registeredIds.length} route{registeredIds.length === 1 ? "" : "s"} on /v1/models
      </span>

      {health?.baseUrl && <span className="pill">{health.baseUrl}</span>}

      <span className="spacer" />

      <button className="btn" onClick={onRefresh} disabled={checking} type="button">
        Recheck router
      </button>
    </>
  );
}
