# Docker Compose Local Single vLLM Model

## Start the stack
```bash
export HF_TOKEN="hf_your_token"

docker compose build --no-cache
docker compose up -d
```
### Endpoints
```text
Model: http://localhost:8000/v1
```
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 32
  }'
```


### Endpoints
```text
Weak/router: http://localhost:8001/v1

# Docker Compose Local Models

## Start the stack
```bash
export HF_TOKEN="hf_your_token"

docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f
```

### Endpoints
```text
Weak/router: http://localhost:8001/v1
Strong:      http://localhost:8002/v1
```

### Test availability:
```bash
curl http://localhost:8001/v1/models
curl http://localhost:8002/v1/models
```

The 4B model has an official vLLM recipe, while Nemotron 3.5 Lightning is a 30B-total/3B-active hybrid MoE optimized for NVFP4 deployment. 

# Single Local vLLM Model
```bash
docker pull vllm/vllm-openai:v0.28.0

docker run -itd --name=nemotron-lightning-vllm --gpus all \
  --privileged --ipc=host -p 8000:8000 \
  -e HF_TOKEN="$HF_TOKEN" \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai:v0.28.0 nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 \
  --mamba-backend flashinfer \
  --enable-prefix-caching \
  --max-num-batched-tokens 16384 \
  --kv-cache-dtype fp8 \
  --moe-backend marlin \
  --attention-backend FLASHINFER \
  --linear-backend marlin \
  --attention-config '{"use_trtllm_attention":true}' \
  --enable-flashinfer-autotune \
  --mamba-cache-mode none \
  --async-scheduling \
  --enable-chunked-prefill \
  --gpu-memory-utilization 0.8 \
  --load-format instanttensor \
  --safetensors-load-strategy prefetch \
  --tensor-parallel-size 1 \
  --reasoning-parser nemotron_v3 \
  --mamba-ssm-cache-dtype float16 \
  --enable-mamba-cache-stochastic-rounding \
  --mamba-cache-philox-rounds 5 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml

```

# Single Local NIM Model

## Pull and run NIM
 ```bash
export LOCAL_NIM_CACHE=~/.cache/nim
mkdir -p "$LOCAL_NIM_CACHE"
docker run -it --rm \
    --gpus all \
    --shm-size=16GB \
    -e NGC_API_KEY="$NGC_API_KEY" \
    -v "$LOCAL_NIM_CACHE:/opt/nim/.cache" \
    -p 8000:8000 \
    nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:latest
```

```bash
export LOCAL_NIM_CACHE="$HOME/.cache/nim"
mkdir -p "$LOCAL_NIM_CACHE"

IMAGE="nvcr.io/nim/nvidia/nemotron-3.5-lightning-30b-a3b:latest"
CONTAINER="nemotron-3.5-lightning"

# Retry the image download indefinitely.
until docker pull "$IMAGE"; do
    echo "Download failed; retrying in 15 seconds..."
    sleep 15
done

# Restart the container whenever its process exits.
docker run -d \
    --name "$CONTAINER" \
    --restart=unless-stopped \
    --gpus all \
    --shm-size=16GB \
    -e NGC_API_KEY="$NGC_API_KEY" \
    -v "$LOCAL_NIM_CACHE:/opt/nim/.cache" \
    -p 8000:8000 \
    --pull=never \
    "$IMAGE"

docker logs -f "$CONTAINER"
```

## Test the NIM
```bash
curl -X 'POST' \
'http://0.0.0.0:8000/v1/chat/completions' \
-H 'accept: application/json' \
-H 'Content-Type: application/json' \
-d '{
    "model": "nvidia/nemotron-3.5-lightning",
    "messages": [{"role":"user", "content":"Write a limerick about the wonders of GPU computing."}],
    "max_tokens": 64
}'
```