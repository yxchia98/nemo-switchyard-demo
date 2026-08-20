"use client";

import { ROUTES } from "@/lib/routes";
import type { Turn } from "@/lib/types";

/**
 * Client-side tally of strong vs weak picks per route. Over enough turns the
 * ab-test row should converge on the 3:7 weights in routes.toml, which gives
 * attendees a baseline to judge the content-aware routes against.
 */
export function RouteTally({ turns }: { turns: Turn[] }) {
  const rows = ROUTES.map((r) => {
    const mine = turns.filter((t) => t.routeId === r.id && !t.error);
    const strong = mine.filter((t) => t.tier === "strong").length;
    const weak = mine.filter((t) => t.tier === "weak").length;
    const unknown = mine.length - strong - weak;
    const latencies = mine.map((t) => t.totalMs).filter((v): v is number => typeof v === "number");
    const avg = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;
    const tokens = mine.reduce((sum, t) => sum + (t.usage?.total_tokens ?? 0), 0);
    return { route: r, total: mine.length, strong, weak, unknown, avg, tokens };
  });

  const any = rows.some((row) => row.total > 0);

  return (
    <div className="card">
      {!any && (
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          No turns yet. Send a few prompts on each route and the split shows up here.
        </div>
      )}

      {any &&
        rows
          .filter((row) => row.total > 0)
          .map(({ route, total, strong, weak, unknown, avg, tokens }) => {
            const pct = (n: number) => (total ? (n / total) * 100 : 0);
            return (
              <div key={route.id} style={{ marginBottom: 12 }}>
                <div className="tally-row" style={{ borderBottom: "none", paddingBottom: 4 }}>
                  <span className="tally-name">{route.id}</span>
                  <span className="tally-counts">
                    {strong}s / {weak}w{unknown ? ` / ${unknown}?` : ""} - n={total}
                  </span>
                  <div className="bar">
                    <i className="s" style={{ width: `${pct(strong)}%` }} />
                    <i className="w" style={{ width: `${pct(weak)}%` }} />
                    <i className="u" style={{ width: `${pct(unknown)}%` }} />
                  </div>
                </div>
                <div className="mono-sm" style={{ marginTop: 4 }}>
                  strong {Math.round(pct(strong))}% - avg {avg === null ? "-" : `${avg}ms`} -{" "}
                  {tokens || 0} tok
                </div>
              </div>
            );
          })}

      {any && (
        <div className="legend">
          <span><i style={{ background: "var(--strong)" }} /> strong</span>
          <span><i style={{ background: "var(--weak)" }} /> weak</span>
          <span><i style={{ background: "#46525f" }} /> unknown</span>
        </div>
      )}
    </div>
  );
}
