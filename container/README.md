# NeMo Switchyard - stage router (OpenRouter free + self-hosted NIM)

Containerised [NVIDIA NeMo Switchyard](https://github.com/NVIDIA-NeMo/Switchyard)
`switchyard-server`, configured with a **stage router** that sends low-capability
agent turns to the free Nemotron 3.5 Lightning endpoint on OpenRouter and
escalates high-capability turns to your own NIM.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build: cargo-installs `switchyard-server`, ships only the binary |
| `routes.toml.template` | Switchyard route config, with `${VAR}` placeholders |
| `entrypoint.sh` | Renders the template via `envsubst`, validates with `--dry-run`, then serves |
| `docker-compose.yml` | Switchyard + an optional NIM service on the same network |
| `.env.example` | Template for runtime config; copy to `.env` |
| `.dockerignore` | Keeps `.env` out of the build context |

## Config format: TOML, not YAML

The `switchyard-server` binary reads an explicit **TOML** file. There is no YAML
schema for the Switchyard server. (YAML is used by a different NVIDIA product,
the NeMo Agent Toolkit, whose `config.yml` has an `llms:` section.)

Switchyard's TOML has three layers:

1. `[llm_clients.*]` - an endpoint plus its wire format
2. `[targets.*]` - a model, bound to a client; `id` is the real model name sent upstream
3. `[routes.*]` - the routing algorithm; its `id` is the model name your agent requests

## Quick start

Nothing is hardcoded in the image. Copy the template, fill it in, and run:

```bash
cp .env.example .env
$EDITOR .env          # set OPENROUTER_API_KEY, NIM_BASE_URL, NIM_MODEL

docker compose up --build
curl http://localhost:4000/health
```

Compose picks up `.env` via `env_file:`. Note that a service-level
`environment:` block takes precedence over `env_file:`, so the compose file
deliberately omits one — add keys there only to force an override.

Without Compose, pass the same file to `docker run`:

```bash
docker build -t switchyard:0.2 .

docker run --rm -p 127.0.0.1:4000:4000 \
  --env-file .env \
  switchyard:0.2
```

Override one value without editing the file (`-e` beats `--env-file`):

```bash
docker run --rm -p 127.0.0.1:4000:4000 \
  --env-file .env \
  -e SWITCHYARD_PICKER=capable_first \
  switchyard:0.2
```

### Env-file gotchas

* **Do not quote values.** `--env-file` treats everything after `=` literally,
  so `OPENROUTER_API_KEY="sk-or-x"` includes the quote characters in the key.
  The entrypoint fails fast if it detects a leading quote.
* **No variable expansion.** `FOO=${BAR}` is not interpolated inside an env file.
* **Keep `.env` out of git and out of the image.** It is in `.dockerignore`;
  add it to `.gitignore` too.
* For real deployments prefer Docker secrets or a Kubernetes Secret mounted as
  env vars over a plaintext file on disk.

Then point any OpenAI-compatible client at the proxy and request the **route id**
as the model:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"switchyard/stage","messages":[{"role":"user","content":"hello"}]}'
```

The response carries the routing decision in headers:

```
x-model-router-selected-model: nvidia/nemotron-3.5-lightning:free
x-model-router-rationale: fall-through selected ... (confidence 0.000)
```

## Environment variables

Defaults for non-secret values live in `entrypoint.sh` as `${VAR:=default}`
rather than in the Dockerfile, so there is one place to read them and anything
in your env file overrides them. `SWITCHYARD_PORT` is the sole exception — it is
also an `ENV` because `EXPOSE` and `HEALTHCHECK` are evaluated against the image
environment at build time.

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | *(required)* | Entrypoint exits if unset |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3.5-lightning:free` | Efficient tier |
| `NIM_BASE_URL` | `http://nim:8000/v1` | Capable tier endpoint |
| `NIM_MODEL` | `nvidia/nemotron-3-ultra` | Set to whatever your NIM serves |
| `NIM_API_KEY` | `EMPTY` | Placeholder; most self-hosted NIMs don't enforce auth |
| `SWITCHYARD_ROUTE_ID` | `switchyard/stage` | The model name clients request |
| `SWITCHYARD_PICKER` | `efficient_first` | `capable_first` favours quality over cost |
| `SWITCHYARD_CONFIDENCE_THRESHOLD` | `0.5` | Signal strength needed to switch tiers |
| `SWITCHYARD_RECENT_WINDOW` | `3` | How many recent turns of signals are scored |
| `SWITCHYARD_HOST` | `0.0.0.0` | Bind inside the container; publish to loopback |
| `SWITCHYARD_PORT` | `4000` | Also an image `ENV` for `EXPOSE`/`HEALTHCHECK` |
| `RUST_LOG` | `info` | |
| `NGC_API_KEY` | *(needed for bundled `nim`)* | Omit if NIM runs elsewhere |

`base_url` cannot be read from the environment by Switchyard itself — only API
keys support that, via `api_key_env`. That is why the config is a template
rendered by `envsubst` at startup rather than a static file.

## How the stage router decides

Per turn it scores recent tool activity: severe errors, repeated unproductive
work or long exploration push toward `capable`; steady edits, especially once
tests pass, favour `efficient`. A single signal is usually not decisive —
corroborating signals must cross `confidence_threshold`. Inconclusive turns fall
back to the `picker` default. No judge-model call is made on the default path,
so routing adds little latency.

Unlike the escalation router, stage routing is **bidirectional** — a session can
move back down to the efficient tier later in a task.

## Things worth knowing before production

- **Switchyard is pre-alpha.** NVIDIA labels it experimental and not for
  production use; the config schema is expected to change before v1.0. The
  `SWITCHYARD_VERSION` build arg is pinned for that reason — re-validate
  `routes.toml` when you bump it.
- **No auth, TLS or rate limiting.** Port 4000 is deliberately published to
  `127.0.0.1`. Put authentication, TLS and rate limits in a real gateway before
  exposing this to a team.
- **The free OpenRouter endpoint is rate limited**, and mid-task tier switching
  has been observed to disrupt tool-calling context consistency in some agent
  frameworks. Raise `confidence_threshold` if you see that, and evaluate on your
  own workload before trusting the cost numbers.
- **First build is slow** (compiling a Rust project from source). The cargo
  registry cache mounts make rebuilds much faster.

## Sources

- [Switchyard repo](https://github.com/NVIDIA-NeMo/Switchyard) and [Getting Started](https://nvidia-nemo.github.io/Switchyard/getting_started/)
- [Core concepts / route types](https://nvidia-nemo.github.io/Switchyard/core_concepts/)
- [Nemotron 3.5 Lightning (free) on OpenRouter](https://openrouter.ai/nvidia/nemotron-3.5-lightning:free)
- [NVIDIA developer blog: routing agent workloads](https://developer.nvidia.com/blog/route-ai-agent-workloads-across-models-with-nvidia-nemo-switchyard/)
