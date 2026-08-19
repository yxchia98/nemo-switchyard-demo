# syntax=docker/dockerfile:1

###############################################################################
# NVIDIA NeMo Switchyard - standalone Rust proxy (switchyard-server)
#
# Switchyard is a Rust binary published on crates.io. There is no official
# NVIDIA container image, so we build it with cargo and ship only the binary.
#
# Build:  docker build -t switchyard:0.2 .
# Run:    see docker-compose.yml / docker run example in the README
###############################################################################

# Pin this to the toolchain you validated against. `1-bookworm` tracks the
# latest stable 1.x; replace with an exact version (e.g. 1.96-bookworm) for
# fully reproducible builds.
ARG RUST_VERSION=1-bookworm

###############################################################################
# Stage 1: build
###############################################################################
FROM rust:${RUST_VERSION} AS build

# switchyard-server pulls in TLS + HTTP crates; build-essential and pkg-config
# cover the native toolchain those crates expect.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libssl-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin the crate version. Switchyard is pre-alpha and its config schema is
# still changing, so an unpinned build can silently break routes.toml.
ARG SWITCHYARD_VERSION=0.2

# Cache the cargo registry and git db between builds.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo install --locked switchyard-server --version "^${SWITCHYARD_VERSION}" \
    && /usr/local/cargo/bin/switchyard-server --help > /dev/null

###############################################################################
# Stage 2: runtime
###############################################################################
FROM debian:bookworm-slim AS runtime

# ca-certificates: required for outbound HTTPS to OpenRouter.
# gettext-base:    provides envsubst, used to render routes.toml from env vars.
# curl:            used by HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        gettext-base \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --shell /usr/sbin/nologin switchyard

COPY --from=build /usr/local/cargo/bin/switchyard-server /usr/local/bin/switchyard-server

# Config template is rendered at startup so endpoints/models come from env.
COPY routes.toml.template /etc/switchyard/routes.toml.template
COPY entrypoint.sh        /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && mkdir -p /run/switchyard \
    && chown switchyard:switchyard /run/switchyard

# ---- Configuration ---------------------------------------------------------
# Deployment config (endpoints, model IDs, router tuning, secrets) is NOT baked
# in here. Pass it at runtime with --env-file / env_file: and see .env.example.
# Non-secret fallback defaults live in entrypoint.sh via ${VAR:=default}, so
# there is a single place to read them.
#
# SWITCHYARD_PORT is the one exception: EXPOSE and HEALTHCHECK are evaluated
# against the image environment, so it needs a value present at build time.
ENV SWITCHYARD_PORT="4000"
ENV RUST_LOG="info"

USER switchyard
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${SWITCHYARD_PORT}/health" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
