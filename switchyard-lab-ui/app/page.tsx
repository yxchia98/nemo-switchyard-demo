"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { DecisionPanel } from "@/components/DecisionPanel";
import { ImageAttachments, MAX_IMAGES, filesToAttachments } from "@/components/ImageAttachments";
import { RoutePicker } from "@/components/RoutePicker";
import { RouteTally } from "@/components/RouteTally";
import { StatusBar, type HealthState } from "@/components/StatusBar";
import { DEFAULT_ROUTE_ID, findRoute } from "@/lib/routes";
import { useSwitchyardChat } from "@/lib/useSwitchyardChat";
import type { ImageAttachment } from "@/lib/types";


export default function Page() {
  const [routeId, setRouteId] = useState(DEFAULT_ROUTE_ID);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [draggingImage, setDraggingImage] = useState(false);

  const [health, setHealth] = useState<HealthState | null>(null);
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [checking, setChecking] = useState(true);
  const [serverStats, setServerStats] = useState<string | null>(null);

  const { turns, busy, send, stop, reset } = useSwitchyardChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const route = useMemo(() => findRoute(routeId), [routeId]);

  const probe = useCallback(async () => {
    setChecking(true);
    try {
      const [h, m] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/models", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setHealth(h);
      setRegisteredIds(Array.isArray(m?.ids) ? m.ids : []);
      setModelsLoaded(true);
    } catch {
      setHealth({ ok: false, status: 0, error: "The Next.js API route could not be reached." });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const addImages = useCallback(async (files: File[]) => {
    setImageError(null);
    try {
      const added = await filesToAttachments(files);
      if (!added.length) {
        setImageError("No supported image was found. Use PNG, JPEG, WebP, or GIF.");
        return;
      }
      setImages((current) => {
        const slots = MAX_IMAGES - current.length;
        if (added.length > slots) setImageError(`A maximum of ${MAX_IMAGES} images can be attached.`);
        return [...current, ...added.slice(0, Math.max(0, slots))];
      });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const submit = useCallback(() => {
    const text = prompt.trim();
    if ((!text && images.length === 0) || busy) return;
    const submittedImages = images;
    setPrompt("");
    setImages([]);
    setImageError(null);
    void send({
      prompt: text,
      images: submittedImages,
      routeId,
      systemPrompt,
      temperature,
      includeHistory,
      // Stage and escalation routes read a window of recent turns, so we only
      // replay history recorded on the same route.
      history: turns.filter((t) => t.routeId === routeId),
    });
  }, [prompt, images, busy, send, routeId, systemPrompt, temperature, includeHistory, turns]);

  const loadStats = useCallback(async () => {
    setServerStats("loading...");
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      const json = await res.json();
      setServerStats(
        json.ok
          ? JSON.stringify(json.stats ?? json.text ?? {}, null, 2).slice(0, 4000)
          : `/v1/stats unavailable: ${json.error ?? json.status}`,
      );
    } catch (err) {
      setServerStats(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <div className="app">
      <header className="brandbar">
        <BrandLockup />
        <span className="spacer" />
        <span className="session-tag">Lab session - NVIDIA NeMo Switchyard</span>
      </header>

      <div className="statusbar">
        <StatusBar
          health={health}
          registeredIds={registeredIds}
          checking={checking}
          onRefresh={probe}
        />
      </div>

      <div className="layout">
        <aside className="rail-left">
          <p className="section-title">Route (model id sent to router)</p>
          <RoutePicker
            value={routeId}
            onChange={setRouteId}
            registeredIds={registeredIds}
            modelsLoaded={modelsLoaded}
          />

          <p className="section-title">Request</p>
          <div className="field">
            <label htmlFor="sys">System prompt (optional)</label>
            <textarea
              id="sys"
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a concise assistant."
            />
          </div>
          <div className="field">
            <label htmlFor="temp">Temperature: {temperature.toFixed(2)}</label>
            <input
              id="temp"
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(e) => setIncludeHistory(e.target.checked)}
            />
            Replay prior turns on this route
          </label>
          <div className="hint" style={{ marginTop: 4 }}>
            Required for the stage router&apos;s 3-turn window and the judge&apos;s 28-turn window.
          </div>

          <p className="hub-footer">
            Dell Technologies APJ AI Innovation Hub - hands-on lab environment. For enablement use
            only; NVIDIA NeMo Switchyard is pre-alpha software and not intended for production.
          </p>
        </aside>

        <main className="center">
          <div className="transcript" ref={scrollRef}>
            {turns.length === 0 && (
              <div className="empty">
                <div className="eyebrow">Dell Technologies APJ AI Innovation Hub</div>
                <h2>Watch the router decide</h2>
                <p>
                  Every turn goes to one route id and comes back with a decision panel: which target
                  served it, why, first-token latency, and token cost.
                </p>
                <ol>
                  <li>
                    Confirm the router is up. Start it with{" "}
                    <code>switchyard-server --config routes.toml --host 127.0.0.1 --port 4000</code>.
                  </li>
                  <li>Pick a route on the left. Start with <code>switchyard/smart</code>.</li>
                  <li>
                    Send <code>hi</code>, then something hard. Compare the tier badges.
                  </li>
                  <li>Paste or upload an image and ask what the model sees. Confirm the selected target supports vision.</li>
                  <li>Switch to <code>switchyard/ab-test</code> and send the same prompt 10 times.</li>
                </ol>
                {health && !health.ok && (
                  <p style={{ color: "var(--danger)", fontWeight: 600 }}>
                    Router unreachable at {health.baseUrl ?? "the configured base URL"}. {health.error}
                  </p>
                )}
              </div>
            )}

            {turns.map((t) => (
              <div className="turn" key={t.id}>
                <div className="bubble-user">
                  <div className="who">Attendee prompt - {t.routeId}</div>
                  {t.prompt || <span className="image-only-label">Image reasoning request</span>}
                  {t.images.length > 0 && (
                    <div className="turn-images">
                      {t.images.map((image) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={image.id} src={image.dataUrl} alt={image.name} title={image.name} />
                      ))}
                    </div>
                  )}
                </div>
                <DecisionPanel turn={t} />
                {t.error ? (
                  <div className="answer err">{t.error}</div>
                ) : (
                  <div className={`answer${t.streaming ? " cursor" : ""}`}>{t.answer}</div>
                )}
              </div>
            ))}
          </div>

          <div
            className={`composer${draggingImage ? " is-dragging" : ""}`}
            onDragEnter={(event) => {
              if (Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"))) {
                event.preventDefault();
                setDraggingImage(true);
              }
            }}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImage(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingImage(false);
              void addImages(Array.from(event.dataTransfer.files));
            }}
          >
            <div className="composer-inner">
              {draggingImage && <div className="drop-callout">Drop image to attach</div>}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPaste={(event) => {
                  const pasted = Array.from(event.clipboardData.items)
                    .filter((item) => item.type.startsWith("image/"))
                    .map((item) => item.getAsFile())
                    .filter((file): file is File => Boolean(file));
                  if (pasted.length) {
                    event.preventDefault();
                    void addImages(pasted);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Ask about an image or send text to ${routeId}...  (Cmd/Ctrl + Enter)`}
              />
              <ImageAttachments
                images={images}
                disabled={busy}
                error={imageError}
                onFiles={(files) => void addImages(files)}
                onRemove={(id) => setImages((current) => current.filter((image) => image.id !== id))}
              />
              <div className="composer-actions">
                <button className="btn primary" onClick={submit} disabled={busy || (!prompt.trim() && images.length === 0)} type="button">
                  {busy ? "Routing..." : "Send"}
                </button>
                {busy && (
                  <button className="btn danger" onClick={stop} type="button">
                    Stop
                  </button>
                )}
                <button className="btn" onClick={reset} disabled={busy || turns.length === 0} type="button">
                  Clear transcript
                </button>
                <span className="spacer" />
                <span className="mono-sm">{turns.length} turns recorded</span>
              </div>
            </div>
          </div>
        </main>

        <aside className="rail-right">
          <p className="section-title">Per-route tally</p>
          <RouteTally turns={turns} />

          {route && (
            <>
              <p className="section-title">{route.label}</p>
              <div className="card">
                <div style={{ fontSize: 12.5, marginBottom: 10 }}>{route.summary}</div>
                <dl className="kv">
                  <dt>type</dt>
                  <dd>{route.kind}</dd>
                  {route.config.map((c) => (
                    <Fragment key={c.key}>
                      <dt title={c.note}>{c.key}</dt>
                      <dd>{c.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>

              <p className="section-title">Try this</p>
              <div className="card">
                <ol className="try-list">
                  {route.tryThis.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              </div>
            </>
          )}

          <p className="section-title">Server-side stats</p>
          <div className="card">
            <button className="btn" onClick={loadStats} type="button">
              Fetch /v1/stats
            </button>
            {serverStats && (
              <details className="raw" open>
                <summary>Router response</summary>
                <pre>{serverStats}</pre>
              </details>
            )}
            <div className="hint" style={{ marginTop: 8 }}>
              The router&apos;s own record of selected models, tokens, latency and outcomes. Compare it
              against the tally above.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
