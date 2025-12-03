# NIM Benchmark Dashboard

Modernised benchmarking harness for exercising NVIDIA NIM, vLLM, Ollama, and llama.cpp deployments. The project ships with a FastAPI
backend that orchestrates load tests and a Vite + React dashboard for monitoring runs.

## Features

- Asynchronous FastAPI backend with pluggable clients for NIM, vLLM, Ollama, and llama.cpp
- Benchmark executor with warmups, concurrency control, and automatic statistics (p50/p95 latency, TPS, TTFT)
- SQLite-backed history with REST endpoints for scheduling and tracking runs
- Auto-benchmark sweeps for quickly exploring concurrency, token, and temperature combinations
- React dashboard featuring backend selectors, parameter knobs, and live history updates
- Built-in model management for Ollama, NVIDIA NIM, and Hugging Face checkpoints
- Runtime controls to mark models as running or stopped across all supported providers
- Containerised deployment (Dockerfiles + `docker-compose.yml`) with multi-architecture build script
- Start and deploy helper scripts for local development or CI pipelines

## Getting started

### Backend (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r benchmark/requirements.txt
uvicorn app.main:app --reload --app-dir benchmark/backend/app --port 8000
```

### Frontend (Vite)

```bash
cd benchmark/frontend
npm install
npm run dev
```

The frontend proxies API traffic to `http://localhost:8000` by default.

### Docker Compose

To build and launch both services locally:

```bash
./scripts/start.sh
```

This command builds the backend and frontend images (compatible with x86_64 and ARM64) and starts them via Docker Compose.
The dashboard is available at <http://localhost:5173>.

Optional API keys can be injected into the backend container by exporting them before running the script. For example,
`LLAMACPP_API_KEY=sk-local ./scripts/start.sh` ensures llama.cpp requests from the dashboard include the bearer token.

### Multi-architecture deployment

`./scripts/deploy.sh` produces ready-to-run images for the backend and frontend. Set `REGISTRY` and `TAG` to push the images
into your container registry:

```bash
REGISTRY=registry.example.com TAG=prod PUSH=1 ./scripts/deploy.sh
```

### Auto benchmark sweeps

Submit a POST request to `/api/benchmarks/auto` with the following payload shape:

```json
{
  "provider": "nim",
  "model_name": "nemotron-3-8b-instruct",
  "prompt": "Write a haiku about GPUs.",
  "sweep_concurrency": [1, 4, 8],
  "sweep_max_tokens": [128, 256],
  "sweep_temperature": [0.1, 0.3],
  "parameters": {
    "request_count": 10,
    "concurrency": 1,
    "warmup_requests": 2,
    "max_tokens": 128,
    "temperature": 0.1,
    "top_p": 0.9,
    "repetition_penalty": 1.0,
    "stream": true,
    "timeout": 120
  }
}
```

The endpoint returns a list of completed runs with metrics for each combination.

### Model management endpoints

The API exposes helper endpoints so you can pull and inspect model assets directly from the dashboard:

| Endpoint | Description |
| --- | --- |
| `GET /api/models/ollama` | List models currently installed on an Ollama host. Optional `base_url` overrides the default target. |
| `POST /api/models/ollama/pull` | Trigger an Ollama pull operation for the requested model name. |
| `POST /api/models/nim/search` | Query the NVIDIA NGC catalog for NIM deployments (requires an NGC API key). |
| `POST /api/models/nim/pull` | Run `docker pull` against `nvcr.io` using the supplied NGC API key. |
| `POST /api/models/ngc/cli` | Use the NGC CLI to pull a checkpoint into the model cache and generate configs for llama.cpp, Ollama, sglang, and vLLM (TensorRT-LLM optional). |
| `POST /api/models/huggingface/search` | Search the Hugging Face model hub using an optional HF API token. |
| `POST /api/models/huggingface/download` | Download a gated model snapshot into the backend's model cache directory. |
| `GET /api/models/runtimes` | Inspect which models are currently marked as running across providers. |
| `POST /api/models/runtimes/start` | Mark a model as running for a given provider/base URL combination. |
| `POST /api/models/runtimes/stop` | Stop tracking a running model for a provider. |

Supply API keys in the request body when required. The frontend surfaces these flows under the new "Model management" section.

### Installing the NGC CLI locally

The backend can orchestrate NGC CLI downloads when `ngc` is available on the host. A helper script installs the CLI into
`/usr/local/bin/ngc`:

```bash
./scripts/install_ngc_cli.sh
```

The script expects `unzip` to be available and may require `sudo` privileges to write to `/usr/local/bin`. Override the
download location by setting `NGC_CLI_URL` if you mirror the archive internally.

## Testing

```bash
pytest
```

The backend unit tests cover the statistics engine and parameter sweep generator.
