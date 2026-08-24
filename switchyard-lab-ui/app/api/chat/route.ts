import { NextRequest } from "next/server";
import type { ChatContentPart } from "@/lib/types";
import {
  baseUrl,
  describeUpstreamError,
  parseDecision,
  timeoutMs,
  upstreamHeaders,
} from "@/lib/switchyard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 *
 * Proxies an OpenAI Chat Completions request to switchyard-server and returns a
 * single SSE stream that multiplexes two kinds of events:
 *
 *   event: decision  -> routing metadata parsed from the response headers,
 *                       emitted BEFORE the first token so the decision panel
 *                       lights up as the answer starts arriving.
 *   event: delta     -> a token chunk.
 *   event: usage     -> token counts from the final chunk, when the router
 *                       includes them.
 *   event: done      -> terminal event with latency and finish reason.
 *   event: error     -> terminal event carrying a readable message.
 */
export async function POST(req: NextRequest) {
  let payload: {
    model?: string;
    messages?: Array<{ role: string; content: string | ChatContentPart[] }>;
    temperature?: number;
    maxTokens?: number | null;
  };

  try {
    payload = await req.json();
  } catch {
    return sse(errorStream("Request body was not valid JSON."));
  }

  const model = payload.model?.trim();
  const messages = payload.messages;
  if (!model) return sse(errorStream("Missing `model` - send a route id such as switchyard/smart."));
  if (!Array.isArray(messages) || messages.length === 0) {
    return sse(errorStream("Missing `messages`."));
  }
  const messageError = validateMessages(messages);
  if (messageError) return sse(errorStream(messageError, 400));

  const wantUsage = process.env.SWITCHYARD_STREAM_USAGE !== "0";
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
  };
  if (typeof payload.maxTokens === "number" && payload.maxTokens > 0) {
    body.max_tokens = payload.maxTokens;
  }
  const headers = upstreamHeaders();

  const url = `${baseUrl()}/v1/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  const startedAt = Date.now();

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(wantUsage ? { ...body, stream_options: { include_usage: true } } : body),
      signal: controller.signal,
    });

    // Some builds reject unknown request fields - retry once without them.
    if (upstream.status === 400 && wantUsage) {
      const probe = await upstream.clone().text();
      if (/stream_options|unknown field|unrecognized/i.test(probe)) {
        upstream = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      }
    }
  } catch (err) {
    clearTimeout(timer);
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? `Switchyard did not respond within ${Math.round(timeoutMs() / 1000)}s.`
        : `Could not reach Switchyard at ${baseUrl()}. Is switchyard-server running? (${
            err instanceof Error ? err.message : String(err)
          })`;
    return sse(errorStream(msg));
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const text = upstream.body ? await upstream.text() : "";
    const imageHint = /image|vision|multimodal|modality/i.test(text)
      ? " The selected Switchyard target may not support image input; use vision-capable strong and weak targets in routes.toml."
      : "";
    return sse(errorStream(`${describeUpstreamError(upstream.status, text)}${imageHint}`, upstream.status));
  }

  const decision = parseDecision(upstream.headers);
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (event: string, data: unknown) =>
        ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send("decision", { ...decision, requestedRoute: model });

      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      let firstTokenAt: number | null = null;
      let finishReason: string | null = null;
      let text = "";
      // Streaming chunks also carry the resolved model - a useful cross-check
      // when a build does not surface it as a header.
      let chunkModel: string | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            for (const line of frame.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (!data || data === "[DONE]") continue;

              let json: any;
              try {
                json = JSON.parse(data);
              } catch {
                continue;
              }

              if (json.model && !chunkModel) {
                chunkModel = json.model;
                if (!decision.selectedModel) {
                  send("decision", {
                    ...decision,
                    selectedModel: json.model,
                    requestedRoute: model,
                    source: "stream-chunk",
                  });
                }
              }
              if (json.usage) send("usage", json.usage);

              const choice = json.choices?.[0];
              const piece: string =
                choice?.delta?.content ??
                choice?.delta?.reasoning_content ??
                "";
              if (choice?.finish_reason) finishReason = choice.finish_reason;
              if (piece) {
                if (firstTokenAt === null) {
                  firstTokenAt = Date.now();
                  send("first_token", { ttftMs: firstTokenAt - startedAt });
                }
                text += piece;
                send("delta", { text: piece });
              }
            }
          }
        }

        send("done", {
          totalMs: Date.now() - startedAt,
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
          finishReason,
          chars: text.length,
          resolvedModel: decision.selectedModel || chunkModel,
        });
      } catch (err) {
        send("error", {
          message: `Stream interrupted: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        clearTimeout(timer);
        ctrl.close();
      }
    },
    cancel() {
      clearTimeout(timer);
      controller.abort();
    },
  });

  return sse(stream);
}


const SUPPORTED_IMAGE_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=]+)$/i;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function validateMessages(messages: Array<{ role: string; content: string | ChatContentPart[] }>): string | null {
  let imageCount = 0;
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role)) {
      return "Each message must have a supported role.";
    }
    if (typeof message.content === "string") continue;
    if (!Array.isArray(message.content) || message.role !== "user") {
      return "Only user messages may contain multimodal content blocks.";
    }
    for (const part of message.content) {
      if (part?.type === "text" && typeof part.text === "string") continue;
      if (part?.type !== "image_url" || typeof part.image_url?.url !== "string") {
        return "Unsupported multimodal content block.";
      }
      const match = part.image_url.url.match(SUPPORTED_IMAGE_RE);
      if (!match) return "Images must be local PNG, JPEG, WebP, or GIF data URLs.";
      imageCount += 1;
      if (imageCount > MAX_IMAGES) return `A request may include at most ${MAX_IMAGES} images.`;
      const padding = (match[2].match(/=*$/)?.[0].length ?? 0);
      const bytes = Math.floor((match[2].length * 3) / 4) - padding;
      if (bytes > MAX_IMAGE_BYTES) return "Each image must be 5 MB or smaller.";
    }
  }
  return null;
}

function sse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function errorStream(message: string, status?: number): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(
        enc.encode(`event: error\ndata: ${JSON.stringify({ message, status })}\n\n`),
      );
      ctrl.close();
    },
  });
}
