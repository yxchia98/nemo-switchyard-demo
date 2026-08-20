import { baseUrl, upstreamHeaders } from "@/lib/switchyard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health - probes the router's /health endpoint. */
export async function GET() {
  const target = `${baseUrl()}/health`;
  const startedAt = Date.now();
  try {
    const res = await fetch(target, {
      headers: upstreamHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    return Response.json({
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - startedAt,
      baseUrl: baseUrl(),
      body: text.slice(0, 400),
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        status: 0,
        latencyMs: Date.now() - startedAt,
        baseUrl: baseUrl(),
        error: `Cannot reach ${target}. Start the router with: switchyard-server --config routes.toml --host 127.0.0.1 --port 4000`,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 200 },
    );
  }
}
