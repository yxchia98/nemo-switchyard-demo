# NVIDIA NeMo Switchyard Hands-on Lab

This workshop introduces NVIDIA NeMo Switchyard and shows how to route inference requests dynamically between models. Participants will deploy Switchyard as a standalone server, test several routing policies, use the included frontend, and integrate Switchyard with a LiteLLM AI Gateway.

## Learning objectives

By the end of this workshop, you will be able to:

* Install and configure a standalone NeMo Switchyard server.
* Define targets and routing policies in TOML.
* Send OpenAI-compatible inference requests through a Switchyard route.
* Observe how a classifier selects a weak or strong model.
* Use LiteLLM and Switchyard together as complementary gateway and model-routing layers.
* Create and use a LiteLLM virtual key for controlled API access.

## Prerequisites

Install or obtain the following before starting:

* Git.
* A native build toolchain.
* Rust and Cargo.
* `curl` and `jq`.
* Node.js and npm for the frontend UI.
* Docker with Docker Compose for the LiteLLM exercise.
* An API key for [NVIDIA-hosted NIMs](https://build.nvidia.com/), [OpenRouter](https://openrouter.ai/), or another OpenAI-compatible endpoint.

> Security note: Never commit API keys to this repository or paste real keys into workshop documentation. If a key is exposed, revoke it immediately and generate a replacement.

## Register for an NVIDIA Developer account

To use NVIDIA-hosted NIMs:

1. Go to [NVIDIA API Catalog](https://build.nvidia.com/) and sign in or create an account.
2. Select your profile in the upper-right corner and open the API Keys page.
3. Select Generate API Key, enter a name, and generate the key.
4. Store the key securely. You will export it as an environment variable later.

To use OpenRouter instead, create an account at [OpenRouter](https://openrouter.ai/) and generate a key from the [OpenRouter Keys page](https://openrouter.ai/keys).

## Install required packages

On Ubuntu or WSL, install the build prerequisites and Rust with `rustup`:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl git jq
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Install `uv` for the repository's Python tooling and CI checks. It is not required to build or run the Rust server:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

If either installer updates your shell configuration, restart the shell before continuing. Verify the tools:

```bash
git --version
rustc --version
cargo --version
uv --version
jq --version
node --version
npm --version
docker compose version
```

## Clone the workshop materials

```bash
git clone https://github.com/yxchia98/nemo-switchyard-demo.git
cd nemo-switchyard-demo
```

## Deploy standalone Switchyard

### Install the server

Install the Rust server from [crates.io](https://crates.io/):

```bash
cargo install --locked --force switchyard-server --version 0.2.0
switchyard-server --help
```

Cargo builds the release binary and installs it into `~/.cargo/bin` by default.

### Configure routes

The Rust server reads an explicit TOML configuration file. Create `routes.toml` with the following targets and routes:

```toml
schema_version = 1

[llm_clients.local_nim]
format = "openai_chat"
base_url = "http://192.168.1.10:8000/v1/chat/completions"

[llm_clients.local_nim_classifier]
format = "openai_chat"
base_url = "http://192.168.1.10:8000/v1/chat/completions"

[llm_clients.openrouter]
format = "openai_chat"
base_url = "https://openrouter.ai/api/v1"
api_key_env = "OPENROUTER_API_KEY"

[targets.weak]
id = "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4"
llm_client = "local_nim"

[targets.classifier]
id = "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4"
llm_client = "local_nim_classifier"
extra_body = { chat_template_kwargs = { enable_thinking = false } }

[targets.strong]
id = "openrouter/free"
llm_client = "openrouter"

[routes.ab_test]
id = "switchyard/ab-test"
type = "random"
targets = ["strong", "weak"]
weights = [3, 7]
seed = 42

[routes.escalate]
id = "switchyard/escalate"
type = "llm_classifier"
mode = "escalation"
classifier_target = "weak"
strong_target = "strong"
weak_target = "weak"
prompt = "Judge whether the weak model is stuck. Return the required structured verdict."
escalation = { confirmations = 2, recent_turn_window = 28, window_message_chars = 500 }

[routes.smart]
id = "switchyard/smart"
type = "llm_classifier"
mode = "capability"
classifier_target = "classifier"
strong_target = "strong"
weak_target = "weak"
base_threshold = 0.5
threshold_step = 0.1

[routes.stage]
id = "switchyard/stage"
type = "stage_router"
capable_target = "strong"
efficient_target = "weak"
picker = "efficient_first"
confidence_threshold = 0.5
recent_turn_window = 3 
```

Model availability and identifiers can change. Before the workshop, confirm that every configured model is available to the selected provider and account.

## Start and use Switchyard

Export the provider credential, validate the configuration without binding a socket, and then start the server:

```bash
export OPENROUTER_API_KEY="<your-openrouter-api-key>"

switchyard-server --config routes.toml --dry-run
switchyard-server --config routes.toml \
  --host 0.0.0.0 \
  --port 4000
```

Use `127.0.0.1` rather than `0.0.0.0` in client URLs. The server binds to `0.0.0.0`, while clients connect to a reachable host address.

Switchyard accepts clients that use the OpenAI Chat Completions, Anthropic Messages, or OpenAI Responses API. A route ID is supplied as the requested model name.

In another terminal, list the exposed models and routes:

```bash
curl -s http://127.0.0.1:4000/v1/models | jq
```

## Test the smart classifier route

At inference time, the `switchyard/smart` route uses the configured classifier to estimate whether the weak target can complete the request. It then selects the weak or strong target according to the routing policy.

### Try a simple request

```bash
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "switchyard/smart",
    "messages": [
      {
        "role": "user",
        "content": "Reply with a short, friendly greeting."
      }
    ]
  }' | jq
```

The classifier should normally select the efficient target for this low-complexity request. Routing is model-driven, so verify the selected target from the available response metadata or server logs rather than treating the outcome as guaranteed.

### Try a more complex request

```bash
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "switchyard/smart",
    "messages": [
      {
        "role": "user",
        "content": "Explain the derivative of fibonacci."
      }
    ]
  }' | jq
```

The classifier may select the capable target for this more demanding reasoning task. Compare the selected target, latency, and response quality with the simple request.

## Start the frontend UI

From the repository root, enter the frontend directory:

```bash
cd switchyard-lab-ui
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/) in a browser. Send both a simple and a complex prompt to the Smart router and compare the routing outcomes.

## Explore other Switchyard routing policies

Use the frontend or API to test the other configured routes:

* `switchyard/ab-test` distributes traffic between targets using configured weights.
* `switchyard/escalate` evaluates whether a conversation should move from the weak target to the strong target.
* `switchyard/stage` chooses between an efficient and capable target according to the stage-router policy.

## LiteLLM and Switchyard

### What is LiteLLM?

[LiteLLM](https://docs.litellm.ai/docs/) is an AI gateway that gives applications a consistent, OpenAI-compatible API for accessing multiple model providers and deployments. As the client-facing gateway, it can centralize authentication, virtual keys, model access, budgets, rate limits, usage tracking, logging, and observability.

LiteLLM and NeMo Switchyard are complementary:

* LiteLLM governs who can call the AI service, which public model groups they can access, and how usage is controlled and observed.
* Switchyard determines which configured target model should handle an individual inference request.
* LiteLLM provides the stable application-facing endpoint, while Switchyard provides inference-time routing intelligence behind that endpoint.

This separation allows platform teams to manage access and operations in LiteLLM without placing model-selection logic in every application. Switchyard can evolve routing policies independently while applications continue using a stable API and model name.

### Conceptual request flow

```text
Application
  → LiteLLM AI Gateway
      → authenticate virtual key
      → enforce model access, budget, and rate limits
      → resolve the public model group
  → NeMo Switchyard route
      → evaluate the configured routing policy
      → select one target model
  → LiteLLM deployment/provider selection
  → provider inference
  → response returned through LiteLLM to the application
```

In the workshop implementation, the lower-level flow may appear as:

```text
LiteLLM Router
  → Switchyard routing plugin
  → Algorithm.run_stream()
  → selected candidate plus optional request delta
  → LiteLLM deployment selection
  → deployment callback receives the same routing object
  → provider inference
```

The first diagram explains responsibilities at the architecture level. The second describes the plugin-level execution path used by this lab.

### Why use both components?

| Requirement | LiteLLM | NeMo Switchyard |
| --- | --- | --- |
| Stable, OpenAI-compatible gateway endpoint | Primary responsibility | Can expose compatible inference APIs |
| Virtual keys and client authentication | Primary responsibility | Not the focus of this lab |
| Budgets, rate limits, and model-access policy | Primary responsibility | Not the focus of this lab |
| Per-request target selection | Coordinates deployment resolution | Primary responsibility |
| Classifier, escalation, random, or stage routing | Exposes the selected route to clients | Executes the routing policy |
| Gateway usage tracking and observability | Primary responsibility | Adds route and target-level routing signals |

### Start the local LiteLLM proxy

Prerequisites are Docker Compose and an OpenRouter key with access to the example models.

From the repository root:

```bash
cd examples/litellm
cp deployment/.env.example deployment/.env
```

Open `deployment/.env` and set the required values, including `OPENROUTER_API_KEY`, `UI_USERNAME`, and `UI_PASSWORD`. Do not commit this file.

Start the environment:

```bash
docker compose -f deployment/compose.yaml up -d --build --wait
curl -fsS http://127.0.0.1:4000/health/liveliness
```

The default profile is `stage`. Send a request to its public Switchyard model group:

```bash
curl -i http://127.0.0.1:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "switchyard",
    "messages": [
      {"role": "user", "content": "Reply with the word hello."}
    ],
    "max_tokens": 64
  }'
```

LiteLLM keeps the response body's `model` field equal to the public model group. In this lab configuration, inspect the `x-litellm-model-name` response header to identify the concrete model selected through Switchyard.

### Access the LiteLLM UI

Open [http://127.0.0.1:4000/ui](http://127.0.0.1:4000/ui) and sign in with the `UI_USERNAME` and `UI_PASSWORD` values configured in `deployment/.env`.

### Create and use a virtual key

In the LiteLLM UI:

1. Create a new virtual key.
2. Grant the key access only to the workshop's Switchyard-backed model or model group.
3. Add a budget or rate limit if the workshop configuration supports it.
4. Copy the generated key and store it securely.

Export the virtual key in the terminal that will call LiteLLM:

```bash
export LITELLM_API_KEY="<your-litellm-virtual-api-key>"
```

Send an authenticated inference request:

```bash
curl -i http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer ${LITELLM_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "switchyard/smart",
    "messages": [
      {"role": "user", "content": "Reply with the word hello."}
    ],
    "max_tokens": 64
  }'
```

If the deployment exposes the Switchyard route under the public group name `switchyard` rather than `switchyard/smart`, use the public name configured in LiteLLM. The virtual key must be authorized for that same public model name.

### Validate the integration

Confirm the following:

* A request without a valid LiteLLM virtual key is rejected when authentication is enabled.
* A valid key can access only its permitted model groups.
* LiteLLM records gateway-level usage for the request.
* Switchyard selects a target according to the configured route.
* The response reaches the application through the same LiteLLM endpoint.
* Simple and complex prompts can produce different target selections while the application-facing model name remains stable.

## Cleanup

Stop the LiteLLM workshop environment:

```bash
docker compose -f deployment/compose.yaml down
```

Stop the standalone Switchyard and frontend processes with `Ctrl+C` in their respective terminals.

Unset credentials when the lab is complete:

```bash
unset NVIDIA_API_KEY
unset OPENROUTER_API_KEY
unset LITELLM_API_KEY
```

## References

* [NVIDIA NeMo Switchyard documentation](https://docs.nvidia.com/nemo/gym/model-server/switchyard/)
* [LiteLLM documentation](https://docs.litellm.ai/docs/)
* [LiteLLM proxy architecture](https://docs.litellm.ai/docs/proxy/architecture)
* [LiteLLM virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
* [LiteLLM routing](https://docs.litellm.ai/docs/routing)
* [LiteLLM OpenAI-compatible providers](https://docs.litellm.ai/docs/providers/openai_compatible)
