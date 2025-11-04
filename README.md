# NIM Benchmark Dashboard

Modernised benchmarking harness for exercising NVIDIA NIM, vLLM, and Ollama deployments. The project ships with a FastAPI
backend that orchestrates load tests and a Vite + React dashboard for monitoring runs.

## Features

- Asynchronous FastAPI backend with pluggable clients for NIM, vLLM, and Ollama
- Benchmark executor with warmups, concurrency control, and automatic statistics (p50/p95 latency, TPS, TTFT)
- SQLite-backed history with REST endpoints for scheduling and tracking runs
- Auto-benchmark sweeps for quickly exploring concurrency, token, and temperature combinations
- React dashboard featuring backend selectors, parameter knobs, and live history updates
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

## Testing

```bash
pytest
```

The backend unit tests cover the statistics engine and parameter sweep generator.
