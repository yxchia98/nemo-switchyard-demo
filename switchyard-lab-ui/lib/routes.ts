/**
 * Route catalogue.
 *
 * Every entry mirrors one [routes.*] table in the routes.toml used by this lab.
 * A route's `id` is the model name clients send to Switchyard, so `id` is what
 * lands in the `model` field of /v1/chat/completions.
 *
 * The teaching notes are rendered in the UI so attendees can connect a TOML
 * knob to an observed routing decision.
 */

export type RouteKind = "random" | "llm_classifier" | "stage_router";

export interface RouteDef {
  /** TOML table key, e.g. [routes.smart] */
  key: string;
  /** Client-visible model id, e.g. switchyard/smart */
  id: string;
  label: string;
  kind: RouteKind;
  accent: string;
  /** One-line description shown next to the route picker. */
  summary: string;
  /** The TOML knobs worth pointing at during the lab. */
  config: Array<{ key: string; value: string; note: string }>;
  /** What attendees should try in order to move the decision. */
  tryThis: string[];
}

export const ROUTES: RouteDef[] = [
  {
    key: "smart",
    id: "switchyard/smart",
    label: "Smart (capability classifier)",
    kind: "llm_classifier",
    accent: "#76b900",
    summary:
      "A classifier model scores each request and picks strong or weak. Session affinity keeps a conversation on one tier.",
    config: [
      { key: "classifier_target", value: "classifier", note: "Model that scores the request" },
      { key: "base_threshold", value: "0.5", note: "Score above this escalates to strong" },
      { key: "threshold_step", value: "0.1", note: "Threshold drift per turn" },
      { key: "session_affinity", value: "true", note: "Reuses the earlier decision for the same session" },
      { key: "message_hash_fallback", value: "true", note: "Hashes the message when no session id is supplied" },
    ],
    tryThis: [
      "Send 'hi' and then 'derive the closed form of the Fibonacci recurrence' - watch the tier change.",
      "Keep the session id fixed and resend a hard prompt: affinity should pin the tier.",
      "Clear the session id and resend - the hash fallback decides per message instead.",
    ],
  },
  {
    key: "stage",
    id: "switchyard/stage",
    label: "Stage router (signal driven)",
    kind: "stage_router",
    accent: "#4ea8ff",
    summary:
      "Reads signals already present in the conversation instead of paying for a classifier call. Efficient tier goes first.",
    config: [
      { key: "capable_target", value: "strong", note: "Tier used when signals look hard" },
      { key: "efficient_target", value: "weak", note: "Tier used when work looks mechanical" },
      { key: "picker", value: "efficient_first", note: "Starts cheap and moves up" },
      { key: "confidence_threshold", value: "0.5", note: "How sure it must be before staying put" },
      { key: "recent_turn_window", value: "3", note: "Only the last 3 turns are inspected" },
    ],
    tryThis: [
      "Send three turns of failing-test / error output and watch it move to the capable tier.",
      "Then send a trivial follow-up - the 3-turn window should let it fall back to efficient.",
    ],
  },
  {
    key: "escalate",
    id: "switchyard/escalate",
    label: "Escalation (judge, sticky)",
    kind: "llm_classifier",
    accent: "#ffb020",
    summary:
      "Starts on weak. A judge watches for a stuck model and promotes the session. Promotion is sticky.",
    config: [
      { key: "classifier_target", value: "judge", note: "Model that returns the structured verdict" },
      { key: "escalation.confirmations", value: "2", note: "Two bad verdicts before promoting" },
      { key: "escalation.recent_turn_window", value: "28", note: "Turns the judge can look back over" },
      { key: "escalation.window_message_chars", value: "500", note: "Chars per message handed to the judge" },
    ],
    tryThis: [
      "Reuse one session id and push the same unsolved problem repeatedly - promotion needs 2 confirmations.",
      "After it promotes, send an easy prompt: it should stay on strong because promotion is sticky.",
    ],
  },
  {
    key: "ab_test",
    id: "switchyard/ab-test",
    label: "A/B test (weighted random)",
    kind: "random",
    accent: "#c56bff",
    summary:
      "Ignores prompt content entirely. Splits traffic 3:7 strong:weak from a fixed seed - the baseline for the others.",
    config: [
      { key: "targets", value: '["strong", "weak"]', note: "Candidate tiers" },
      { key: "weights", value: "[3, 7]", note: "30% strong / 70% weak" },
      { key: "seed", value: "42", note: "Fixed seed makes the sequence reproducible" },
    ],
    tryThis: [
      "Send the same prompt 10 times and compare the tally against the 3:7 split.",
      "Restart the server and repeat - the seed makes the sequence repeat too.",
    ],
  },
];

export const DEFAULT_ROUTE_ID = "switchyard/smart";

export function findRoute(id: string): RouteDef | undefined {
  return ROUTES.find((r) => r.id === id);
}

/** Target ids declared in [targets.*], used to classify a resolved model. */
export const TARGET_MODELS: Record<string, "strong" | "weak" | "classifier"> = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": "strong",
  "nvidia/nemotron-3.5-lightning:free": "weak",
};

export function tierForModel(model?: string | null): "strong" | "weak" | "unknown" {
  if (!model) return "unknown";
  const hit = TARGET_MODELS[model.trim()];
  if (hit === "strong") return "strong";
  if (hit === "weak") return "weak";
  const lowered = model.toLowerCase();
  if (lowered.includes("ultra") || lowered.includes("550b")) return "strong";
  if (lowered.includes("lightning")) return "weak";
  return "unknown";
}
