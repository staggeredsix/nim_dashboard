"""FastAPI application exposing benchmarking functionality."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import create_all
from .model_registry import ModelRegistryService, ModelRuntimeService
from .schemas import (
    AutoBenchmarkRequest,
    BackendMetadata,
    BenchmarkHistoryItem,
    BenchmarkRequest,
    BenchmarkRunResponse,
    BenchmarkProvider,
    ErrorResponse,
    HuggingFaceDownloadRequest,
    HuggingFaceSearchRequest,
    ModelActionResponse,
    ModelListResponse,
    ModelRuntimeListResponse,
    ModelRuntimeRequest,
    NimPullRequest,
    NimSearchRequest,
    OllamaPullRequest,
    PaginatedBenchmarkHistory,
)
from .service import BenchmarkService
from .settings import settings

app = FastAPI(title=settings.api_title, version=settings.api_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

service = BenchmarkService()
model_registry = ModelRegistryService(settings=settings)
runtime_service = ModelRuntimeService(settings=settings)


def get_service() -> BenchmarkService:
    return service


@app.on_event("startup")
async def startup() -> None:
    create_all()


@app.get("/health", summary="Service health probe")
async def health_check() -> dict:
    return {"status": "ok", "version": settings.api_version}


@app.get("/api/backends", response_model=List[BackendMetadata])
async def list_backends() -> List[BackendMetadata]:
    return [
        BackendMetadata(
            name="Ollama",
            provider=BenchmarkProvider.OLLAMA,
            default_base_url=settings.ollama_base_url,
            description="Local inference server with model library and GPU acceleration.",
            parameters={
                "temperature": "Controls randomness of generation",
                "top_p": "Probability mass for nucleus sampling",
                "num_predict": "Maximum number of tokens to generate",
                "keep_alive": "Duration to keep model warm between requests",
            },
        ),
        BackendMetadata(
            name="NVIDIA NIM",
            provider=BenchmarkProvider.NIM,
            default_base_url=settings.nim_base_url,
            description="Hosted or on-prem NVIDIA Inference Microservice deployment.",
            parameters={
                "temperature": "Sampling temperature",
                "top_p": "Nucleus sampling",
                "repetition_penalty": "Discourage repeated tokens",
                "max_tokens": "Maximum tokens to generate",
                "model": "Deployed model identifier",
            },
        ),
        BackendMetadata(
            name="vLLM",
            provider=BenchmarkProvider.VLLM,
            default_base_url=settings.vllm_base_url,
            description="High-throughput open-source LLM inference engine.",
            parameters={
                "temperature": "Sampling temperature",
                "top_p": "Nucleus sampling",
                "best_of": "Number of candidates before returning best",
                "use_beam_search": "Toggle beam search decoding",
            },
        ),
        BackendMetadata(
            name="llama.cpp",
            provider=BenchmarkProvider.LLAMACPP,
            default_base_url=settings.llamacpp_base_url,
            description="Lightweight inference server powered by llama.cpp.",
            parameters={
                "temperature": "Sampling temperature",
                "top_p": "Nucleus sampling",
                "n_predict": "Tokens to predict per request",
            },
        ),
    ]


@app.post(
    "/api/benchmarks",
    response_model=BenchmarkRunResponse,
    responses={404: {"model": ErrorResponse}},
)
async def schedule_benchmark(
    request: BenchmarkRequest,
    svc: BenchmarkService = Depends(get_service),
) -> BenchmarkRunResponse:
    run = await svc.schedule_run(request)
    return BenchmarkRunResponse(id=run.id, status=run.status)


@app.get(
    "/api/benchmarks/{run_id}",
    response_model=BenchmarkHistoryItem,
    responses={404: {"model": ErrorResponse}},
)
async def get_benchmark(run_id: int, svc: BenchmarkService = Depends(get_service)) -> BenchmarkHistoryItem:
    run = await svc.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    return run


@app.get("/api/benchmarks", response_model=PaginatedBenchmarkHistory)
async def list_benchmarks(
    limit: int = 20,
    offset: int = 0,
    svc: BenchmarkService = Depends(get_service),
) -> PaginatedBenchmarkHistory:
    runs = await svc.list_runs(limit=limit, offset=offset)
    total = await svc.count_runs()
    return PaginatedBenchmarkHistory(runs=runs, total=total)


@app.post("/api/benchmarks/auto", response_model=List[BenchmarkHistoryItem])
async def auto_benchmark(
    request: AutoBenchmarkRequest,
    svc: BenchmarkService = Depends(get_service),
) -> List[BenchmarkHistoryItem]:
    results = await svc.run_auto(request)
    history_items: List[BenchmarkHistoryItem] = []
    for result in results:
        history_items.append(
            BenchmarkHistoryItem(
                id=result.run_id,
                provider=result.provider,
                model_name=result.model_name,
                status="completed",
                created_at=datetime.utcnow().isoformat(),
                completed_at=datetime.utcnow().isoformat(),
                metrics=result.metrics,
                error=None,
            )
        )
    return history_items


@app.get("/api/models/ollama", response_model=ModelListResponse)
async def list_ollama_models(base_url: str | None = None) -> ModelListResponse:
    models = await model_registry.list_ollama_models(base_url=base_url)
    return ModelListResponse(provider=BenchmarkProvider.OLLAMA, models=models)


@app.post("/api/models/ollama/pull", response_model=ModelActionResponse)
async def pull_ollama_model(request: OllamaPullRequest) -> ModelActionResponse:
    return await model_registry.pull_ollama_model(request)


@app.get("/api/models/runtimes", response_model=ModelRuntimeListResponse)
async def list_running_models() -> ModelRuntimeListResponse:
    return await runtime_service.list_runtimes()


@app.post("/api/models/runtimes/start", response_model=ModelActionResponse)
async def start_model(request: ModelRuntimeRequest) -> ModelActionResponse:
    return await runtime_service.start_model(request)


@app.post("/api/models/runtimes/stop", response_model=ModelActionResponse)
async def stop_model(request: ModelRuntimeRequest) -> ModelActionResponse:
    return await runtime_service.stop_model(request)


@app.post("/api/models/nim/search", response_model=ModelListResponse)
async def search_nim_models(request: NimSearchRequest) -> ModelListResponse:
    models = await model_registry.search_nim_models(request)
    return ModelListResponse(provider=BenchmarkProvider.NIM, models=models)


@app.post("/api/models/nim/pull", response_model=ModelActionResponse)
async def pull_nim_model(request: NimPullRequest) -> ModelActionResponse:
    return await model_registry.pull_nim_model(request)


@app.post("/api/models/huggingface/search", response_model=ModelListResponse)
async def search_huggingface_models(request: HuggingFaceSearchRequest) -> ModelListResponse:
    models = await model_registry.search_huggingface_models(request)
    return ModelListResponse(provider=BenchmarkProvider.VLLM, models=models)


@app.post("/api/models/huggingface/download", response_model=ModelActionResponse)
async def download_huggingface_model(request: HuggingFaceDownloadRequest) -> ModelActionResponse:
    return await model_registry.download_huggingface_model(request)
