#!/bin/sh
set -eu

TEMPLATE="/etc/switchyard/routes.toml.template"
RENDERED="/run/switchyard/routes.toml"

# ---- Non-secret defaults ---------------------------------------------------
# Anything supplied via --env-file / env_file: overrides these.
: "${OPENROUTER_BASE_URL:=https://openrouter.ai/api/v1}"
: "${OPENROUTER_MODEL:=nvidia/nemotron-3.5-lightning:free}"
: "${NIM_BASE_URL:=http://nim:8000/v1}"
: "${NIM_MODEL:=nvidia/nemotron-3-ultra}"
: "${SWITCHYARD_ROUTE_ID:=switchyard/stage}"
: "${SWITCHYARD_PICKER:=efficient_first}"
: "${SWITCHYARD_CONFIDENCE_THRESHOLD:=0.5}"
: "${SWITCHYARD_RECENT_WINDOW:=3}"
: "${SWITCHYARD_HOST:=0.0.0.0}"
: "${SWITCHYARD_PORT:=4000}"

# OpenRouter key is required for the efficient tier.
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
    echo "FATAL: OPENROUTER_API_KEY is not set." >&2
    echo "Pass it via --env-file .env (see .env.example) or -e." >&2
    exit 1
fi

# Catch the classic --env-file mistake: quotes are taken literally.
case "$OPENROUTER_API_KEY" in
    \"*|\'*)
        echo "FATAL: OPENROUTER_API_KEY starts with a quote character." >&2
        echo "env-file values must be unquoted: OPENROUTER_API_KEY=sk-or-..." >&2
        exit 1
        ;;
esac

# Most self-hosted NIM deployments don't enforce auth. Switchyard still needs
# the env var named by api_key_env to resolve, so default it to a placeholder.
: "${NIM_API_KEY:=EMPTY}"
export NIM_API_KEY

export OPENROUTER_BASE_URL OPENROUTER_MODEL NIM_BASE_URL NIM_MODEL \
       SWITCHYARD_ROUTE_ID SWITCHYARD_PICKER \
       SWITCHYARD_CONFIDENCE_THRESHOLD SWITCHYARD_RECENT_WINDOW

envsubst < "$TEMPLATE" > "$RENDERED"

echo "--- rendered routes.toml ---"
sed 's/\(api_key[^=]*=\).*/\1 [redacted]/' "$RENDERED"
echo "----------------------------"

# Fail fast on bad config: --dry-run validates schema, env lookups, target
# references and route construction without binding a socket.
switchyard-server --config "$RENDERED" --dry-run

exec switchyard-server \
    --config "$RENDERED" \
    --host "${SWITCHYARD_HOST}" \
    --port "${SWITCHYARD_PORT}" \
    "$@"
