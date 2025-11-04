"""Core benchmarking logic."""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Dict, Iterable, List

try:
    import httpx
except ImportError:  # pragma: no cover - fallback when dependency missing
    class _HttpxProxy:
        def __getattr__(self, item):
            raise RuntimeError(
                "The httpx package is required to execute benchmarks. "
                "Install it with 'pip install httpx'."
            )

    httpx = _HttpxProxy()  # type: ignore

from .clients import create_client
from .clients.base import BackendClient, RequestMetrics
from .schemas import AutoBenchmarkRequest, BenchmarkParameters, BenchmarkRequest, BenchmarkResult
from .utils import model_copy, model_dump
from .settings import settings
from .stats import StatsAccumulator


class BenchmarkExecutor:
    """Execute a benchmark against a given backend."""

    def __init__(self, request: BenchmarkRequest) -> None:
        self.request = request
        self.timeout = request.parameters.timeout or settings.default_timeout

    def _create_client(self) -> BackendClient:
        base_url = self.request.base_url or self._default_base_url()
        api_key: str | None = None
        if self.request.provider == self.request.provider.NIM:
            api_key = settings.ngc_api_key
        elif self.request.provider == self.request.provider.LLAMACPP:
            api_key = settings.llamacpp_api_key
        return create_client(
            self.request.provider,
            base_url=base_url,
            model_name=self.request.model_name,
            parameters=self.request.parameters,
            backend_parameters=self.request.backend_parameters,
            timeout=self.timeout,
            api_key=api_key,
        )

    def _default_base_url(self) -> str:
        if self.request.provider == self.request.provider.OLLAMA:
            return settings.ollama_base_url
        if self.request.provider == self.request.provider.NIM:
            return settings.nim_base_url
        if self.request.provider == self.request.provider.VLLM:
            return settings.vllm_base_url
        if self.request.provider == self.request.provider.LLAMACPP:
            return settings.llamacpp_base_url
        raise ValueError(f"Unknown provider {self.request.provider}")

    async def iter_metrics(self) -> AsyncIterator[RequestMetrics]:
        client = self._create_client()
        limits = httpx.Limits(max_connections=self.request.parameters.concurrency)
        async with httpx.AsyncClient(limits=limits, timeout=self.timeout) as http_client:
            if self.request.parameters.warmup_requests:
                await client.warmup(self.request.prompt, http_client)

            semaphore = asyncio.Semaphore(self.request.parameters.concurrency)

            async def worker() -> RequestMetrics:
                async with semaphore:
                    return await client.generate(self.request.prompt, http_client)

            tasks = [asyncio.create_task(worker()) for _ in range(self.request.parameters.request_count)]

            for task in asyncio.as_completed(tasks):
                metrics = await task
                yield metrics

    async def run(self, run_id: int | None = None) -> BenchmarkResult:
        accumulator = StatsAccumulator()
        async for metrics in self.iter_metrics():
            accumulator.add(metrics)

        return BenchmarkResult(
            run_id=run_id or 0,
            provider=self.request.provider,
            model_name=self.request.model_name,
            parameters={
                "prompt": self.request.prompt,
                "base_url": str(self.request.base_url) if self.request.base_url else None,
                "parameters": model_dump(self.request.parameters),
                "backend_parameters": model_dump(self.request.backend_parameters),
            },
            metrics=accumulator.summarize(),
        )


async def run_auto_benchmark(request: AutoBenchmarkRequest) -> List[BenchmarkResult]:
    results: List[BenchmarkResult] = []
    combos = build_parameter_grid(
        request.parameters,
        concurrency_values=request.sweep_concurrency,
        max_tokens_values=request.sweep_max_tokens,
        temperature_values=request.sweep_temperature,
    )
    for params in combos:
        bench_request = BenchmarkRequest(
            provider=request.provider,
            model_name=request.model_name,
            prompt=request.prompt,
            base_url=request.base_url,
            parameters=params,
            backend_parameters=request.backend_parameters,
        )
        executor = BenchmarkExecutor(bench_request)
        result = await executor.run()
        results.append(result)
    return results


def build_parameter_grid(
    base: BenchmarkParameters,
    *,
    concurrency_values: Iterable[int],
    max_tokens_values: Iterable[int],
    temperature_values: Iterable[float],
) -> List[BenchmarkParameters]:
    grid: List[BenchmarkParameters] = []
    for concurrency in concurrency_values:
        for max_tokens in max_tokens_values:
            for temperature in temperature_values:
                grid.append(
                    model_copy(
                        base,
                        update={
                            "concurrency": concurrency,
                            "max_tokens": max_tokens,
                            "temperature": temperature,
                        },
                    )
                )
    return grid
