"""FastAPI application exposing benchmarking functionality."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .database import create_all
from .schemas import (
    AutoBenchmarkRequest,
    BackendMetadata,
    BenchmarkHistoryItem,
    BenchmarkRequest,
    BenchmarkRunResponse,
    BenchmarkProvider,
    ErrorResponse,
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
