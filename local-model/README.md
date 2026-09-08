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