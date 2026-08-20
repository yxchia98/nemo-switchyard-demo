import { baseUrl, upstreamHeaders } from "@/lib/switchyard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/models
 *
 * Switchyard lists route ids on GET /v1/models - a route's id is the model id
 * clients send. The UI uses this to confirm the four routes in routes.toml are
 * actually loaded, and to flag any route the server did not register.
 */
export async function GET() {
  try {
    const res = await fetch(`${baseUrl()}/v1/models`, {
      headers: upstreamHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) {
      return Response.json(
        { ok: false, status: res.status, ids: [], error: text.slice(0, 400) },
        { status: 200 },
      );
    }
    const parsed = JSON.parse(text);
    const ids: string[] = Array.isArray(parsed?.data)
      ? parsed.data.map((m: any) => m?.id).filter((v: unknown): v is string => typeof v === "string")
      : [];
    return Response.json({ ok: true, status: res.status, ids, raw: parsed });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        status: 0,
        ids: [],
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 },
    );
  }
}
