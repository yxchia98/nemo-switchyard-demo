import { baseUrl, upstreamHeaders } from "@/lib/switchyard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats
 *
 * Mirrors `curl -s http://localhost:4000/v1/stats`, the router's own view of
 * selected models, token usage, latency and call outcomes. Handy for comparing
 * the UI's client-side tally against server-side truth.
 */
export async function GET() {
  try {
    const res = await fetch(`${baseUrl()}/v1/stats`, {
      headers: upstreamHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      return Response.json(
        { ok: false, status: res.status, error: text.slice(0, 600) },
        { status: 200 },
      );
    }
    try {
      return Response.json({ ok: true, status: res.status, stats: JSON.parse(text) });
    } catch {
      return Response.json({ ok: true, status: res.status, stats: null, text: text.slice(0, 4000) });
    }
  } catch (err) {
    return Response.json(
      { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) },
      { status: 200 },
    );
  }
}
