# NeMo Switchyard Lab Console
### Dell Technologies APJ AI Innovation Hub

A Next.js frontend for a **running** NVIDIA NeMo Switchyard router, themed for the Dell
Technologies APJ AI Innovation Hub. Built for a lab session: attendees send prompts
through a route and immediately see **which target served the turn, why, how fast, and at
what token cost**.

The browser never talks to the router directly. Every call is proxied through Next.js
route handlers in `app/api/*`, so the router URL stays in server-side env config and
there is no CORS to debug in the room.

---

## 1. Start the router

Switchyard is a Rust proxy that speaks OpenAI Chat Completions, OpenAI Responses, and
Anthropic Messages. Install the server, export the provider credential, validate the
config, then bind the socket:

```bash
cargo install --locked switchyard-server

export OPENROUTER_API_KEY="your-openrouter-key"

# Validates schema, env lookup, target references and route construction
# without binding a socket. Run this first - it catches most TOML mistakes.
switchyard-server --config routes.toml --dry-run

switchyard-server --config routes.toml --host 127.0.0.1 --port 4000
```

Confirm it is alive from a second terminal:

```bash
curl http://localhost:4000/health
curl -s http://localhost:4000/v1/models   # lists the four route ids
curl -s http://localhost:4000/v1/stats    # router's own routing/usage record
```

`api_key_env` in the TOML names the environment variable the server reads at startup —
the secret never goes in the file, and it must be exported in the **same shell** that
starts the server.

## 2. Start this app

```bash
npm install
cp .env.example .env.local     # defaults to http://127.0.0.1:4000
npm run dev                    # http://localhost:3000
```

`.env.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SWITCHYARD_BASE_URL` | `http://127.0.0.1:4000` | Where `switchyard-server` is listening |
| `SWITCHYARD_API_KEY` | *(empty)* | Only needed if you front the router with a gateway; Switchyard itself needs no client auth |
| `SWITCHYARD_STREAM_USAGE` | `1` | Ask for token counts in the final stream chunk; set `0` if your build rejects `stream_options` |
| `SWITCHYARD_TIMEOUT_MS` | `180000` | Per-request timeout |
| `NEXT_PUBLIC_BRAND_LOGO_SRC` | *(unset)* | Optional path to the official Dell logo in `public/`; see [Branding](#branding) |

---

## Branding

The console is themed with the Dell Technologies palette and carries the **Dell
Technologies APJ AI Innovation Hub** lockup in the header, page title, and footer.

### Colour and type

| Token | Value | Use |
| --- | --- | --- |
| Dell Blue | `#0076CE` (Pantone 2174 C) | Primary brand colour: header, primary button, active route, section headings |
| Dell Blue dark / deep / ink | `#005CA3` / `#00457A` / `#002B4D` | Header gradient, hover states, rationale text |
| Dell Gray | `#AAAAAA` | Neutral / "unknown tier" bars |
| Dell Dark Gray | `#444444` | Preformatted header dumps |

Routing tiers deliberately use amber (`#B45309`) and teal (`#0F766E`) rather than blue, so
a routing decision never visually competes with brand colour. All foreground/background
pairs were checked to **WCAG AA** (lowest is 4.61:1).

Dell's corporate typefaces are **Museo** and **Museo Sans**, which are licensed. The
stylesheet requests `Museo Sans` first and falls back through the closest widely available
geometric-humanist stack, so nothing breaks on a machine without the licensed fonts. If
your Hub image has them installed, they load automatically.

### About the logo

`components/BrandLockup.tsx` **does not redraw the Dell Technologies logo.** The circular
DELL mark with the slanted "E" is a registered trademark, and brand standards require the
official asset with correct clear space (the height of the "D" on all sides) and a 30px
minimum digital size. Redrawing it in code would violate that.

Instead the lockup ships in two modes:

1. **Default** — a typographic lockup ("Dell Technologies" / "APJ AI Innovation Hub")
   next to an *original* routing glyph drawn for this console: one inbound request fanning
   out to two model tiers. Safe to use as-is.
2. **Official mark** — download the approved logo from the Dell brand resource center or
   partner portal, drop it in `public/`, and set:

   ```bash
   # .env.local
   NEXT_PUBLIC_BRAND_LOGO_SRC=/dell-technologies-logo-white.svg
   ```

   The real mark then replaces the glyph. Use the **white** logo variant — the header is a
   dark Dell Blue gradient, and the Dell Blue logo is only approved on white or Dell Light
   Gray backgrounds.

Swap the wording for a different Hub or team by editing `components/BrandLockup.tsx` and
the footer line in `app/page.tsx`.

---

## Image reasoning

The composer accepts image input three ways: click **Add image**, drag files onto the
composer, or paste a screenshot directly from the clipboard. A request may contain up to
four PNG, JPEG, WebP, or GIF files at 5 MB each. Images are read locally as data URLs and
sent through the server-side proxy as OpenAI-compatible content blocks:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is unusual in this image?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,...", "detail": "auto" } }
  ]
}
```

The app never uploads images anywhere except the configured Switchyard request path. The
proxy rejects unsupported formats, non-data URLs, oversized files, and more than four
images before forwarding. For a text-only follow-up, it replays only the most recent image
turn; it does not repeatedly resend every image in the transcript.

> **Route requirement:** Switchyard can choose either `strong` or `weak`, so both answer
> targets used by an image-routing lab should support OpenAI-style image input. If a chosen
> OpenRouter model is text-only, the UI surfaces the provider error and recommends using
> vision-capable targets. Verify current model modality support before the session; free
> model variants can change independently of this frontend.

---

## The four routes in this lab

A route's `id` is the model name clients send; the table key (`[routes.smart]`) is only a
local name. All four ids are registered on `GET /v1/models`.

| Route id | Type | What it demonstrates |
| --- | --- | --- |
| `switchyard/smart` | `llm_classifier` / capability | A classifier scores the request against `base_threshold = 0.5`; `session_affinity` pins a conversation to one tier |
| `switchyard/stage` | `stage_router` | Reads conversation signals over a 3-turn window instead of paying for a classifier call; `efficient_first` |
| `switchyard/escalate` | `llm_classifier` / escalation | Starts weak; a judge promotes the session after `confirmations = 2`, and promotion is sticky |
| `switchyard/ab-test` | `random` | Content-blind 3:7 strong:weak split from `seed = 42` — the baseline the others are judged against |

Targets: `strong` = `nvidia/nemotron-3-ultra-550b-a55b:free`, and `weak`, `classifier`,
`judge` all = `nvidia/nemotron-3.5-lightning:free`.

> Because `weak`, `classifier` and `judge` point at the **same** model id, a resolved
> model of `nemotron-3.5-lightning` means "the weak tier answered". Only
> `nemotron-3-ultra-550b` proves an escalation happened. Worth saying out loud in the lab.

---

## Suggested lab flow

1. **Baseline the split.** Select `switchyard/ab-test`, send the same short prompt ~10
   times, then read the tally in the right rail. It should trend toward 30% strong.
   Content is irrelevant here — that is the point.
2. **Introduce content awareness.** Switch to `switchyard/smart`. Send `hi`, then
   `derive the closed form of the Fibonacci recurrence`. The tier badge should move.
3. **Show affinity.** Keep the session id fixed and resend a hard prompt: the earlier
   decision is reused. Clear the session id and resend — now `message_hash_fallback`
   decides per message.
4. **Show signal-driven routing.** On `switchyard/stage`, paste three turns of failing
   test output. Watch it climb to the capable tier, then send a trivial follow-up and
   watch the 3-turn window let it fall back.
5. **Show sticky escalation.** On `switchyard/escalate`, reuse one session id and push an
   unsolved problem. Promotion needs two confirmations; afterwards even an easy prompt
   stays on strong.
6. **Reconcile with the server.** Click *Fetch /v1/stats* and compare the router's own
   record against the client-side tally.

---

## How the observability works

Switchyard records the selected model and a human-readable rationale on the response.
`app/api/chat/route.ts` reads those response headers, then emits a single SSE stream to
the browser that multiplexes:

| Event | Payload |
| --- | --- |
| `decision` | selected model/target, rationale, score, escalation flag, all raw routing headers — sent **before** the first token |
| `first_token` | time to first token |
| `delta` | a token chunk |
| `usage` | prompt/completion/total tokens from the final chunk |
| `done` | total latency, finish reason, resolved model |
| `error` | readable failure message |

Header naming has shifted across pre-alpha builds, so `lib/switchyard.ts` collects every
`x-switchyard-*` / `x-sy-*` / routing-ish header and resolves each field from a list of
candidate names rather than hardcoding one spelling. If no routing headers are present,
the tier is inferred from the resolved model id in the stream and the decision panel says
so explicitly instead of silently guessing.

Session identity is sent three ways (`user` and `session_id` in the body, plus
`x-switchyard-session-id` / `x-session-id` headers) so affinity works regardless of where
your build reads it.

---

## Project layout

```
app/
  api/chat/route.ts     Streaming proxy -> POST /v1/chat/completions, emits decision + delta SSE
  api/health/route.ts   -> GET /health
  api/models/route.ts   -> GET /v1/models, confirms all four routes registered
  api/stats/route.ts    -> GET /v1/stats
  page.tsx              Console: route picker, transcript, decision panels, tally
  layout.tsx, globals.css
components/
  BrandLockup.tsx       Dell Technologies APJ AI Innovation Hub lockup (+ optional official logo)
  DecisionPanel.tsx     Per-turn: tier badge, model, rationale, latency, tokens, raw headers
  ImageAttachments.tsx  File picker, paste/drop processing, validation and removable previews
  RoutePicker.tsx       The four routes; flags any not listed on /v1/models
  RouteTally.tsx        Strong/weak split, avg latency and tokens per route
  StatusBar.tsx         Health + route discovery indicators
lib/
  switchyard.ts         Server-only: base URL, headers, header->decision parsing, error mapping
  routes.ts             Route catalogue mirroring routes.toml, incl. teaching notes
  useSwitchyardChat.ts  Client hook that folds SSE events into Turn records
  types.ts
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "router unreachable" | Server not running, or wrong port | Start with `--host 127.0.0.1 --port 4000`; match `SWITCHYARD_BASE_URL` |
| A route shows *not listed on /v1/models* | Route id mismatch or TOML typo | `switchyard-server --config routes.toml --dry-run` |
| `Route not found` | The `model` field does not match any route `id` | Use the full id, e.g. `switchyard/smart`, not the table key `smart` |
| 401 / 403 from upstream | `OPENROUTER_API_KEY` not exported in the server's shell | `test -n "$OPENROUTER_API_KEY" && echo set \|\| echo missing` |
| Token counts blank | Build ignores `stream_options` | Expected; latency and tier still work. Use `/v1/stats` for authoritative usage |
| Image request rejected | Selected target does not accept image input | Configure vision-capable `strong` and `weak` targets; confirm OpenRouter modality support |
| Image will not attach | Unsupported format, over 5 MB, or already four attached | Use PNG/JPEG/WebP/GIF and reduce file size/count |
| Tier always "unknown" | No routing headers and an unrecognized model id | Add the model id to `TARGET_MODELS` in `lib/routes.ts` |

Switchyard is pre-alpha and explicitly not for production; this console is Dell APJ AI
Innovation Hub lab instrumentation, not a production gateway. Pin your Switchyard version before the
session so header names and endpoints do not shift mid-lab.
