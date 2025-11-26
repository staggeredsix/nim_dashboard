"""Core benchmarking logic."""
from __future__ import annotations

import asyncio
import json
import re
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
        self._resolved_prompts: List[str] | None = None

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
            prompts = await self._prepare_prompts(client, http_client)
            self._resolved_prompts = prompts

            if self.request.parameters.warmup_requests:
                await client.warmup(prompts[0], http_client)

            semaphore = asyncio.Semaphore(self.request.parameters.concurrency)

            async def worker(task_index: int) -> RequestMetrics:
                async with semaphore:
                    prompt = prompts[task_index % len(prompts)]
                    return await client.generate(prompt, http_client)

            tasks = [
                asyncio.create_task(worker(index))
                for index in range(self.request.parameters.request_count)
            ]

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
                "prompt_settings": {
                    "use_random_prompts": self.request.use_random_prompts,
                    "random_prompt_count": self.request.random_prompt_count,
                    "resolved_prompts": self._resolved_prompts,
                },
                "base_url": str(self.request.base_url) if self.request.base_url else None,
                "parameters": model_dump(self.request.parameters),
                "backend_parameters": model_dump(self.request.backend_parameters),
            },
            metrics=accumulator.summarize(),
        )

    async def _prepare_prompts(
        self, client: BackendClient, http_client: httpx.AsyncClient
    ) -> List[str]:
        if not self.request.use_random_prompts:
            return [self.request.prompt]

        prompt_count = max(1, int(self.request.random_prompt_count or 1))
        instructions = (
            "Generate {count} unique and diverse user prompts that can be used to benchmark "
            "a large language model. Return the prompts as a JSON array of strings."
        ).format(count=prompt_count)

        guidance = self.request.prompt.strip()
        if guidance:
            instructions += (
                " Each prompt should be inspired by the following guidance: "
                f"{guidance}"
            )

        metrics = await client.generate(instructions, http_client)
        prompts = self._extract_prompt_list(metrics.completion, prompt_count)

        if not prompts:
            raise ValueError("Model did not return any prompts that could be parsed.")

        return prompts

    @staticmethod
    def _extract_prompt_list(response_text: str, expected: int) -> List[str]:
        text = response_text.strip()
        if not text:
            return []

        if text.startswith("```"):
            text = BenchmarkExecutor._strip_code_fence(text)

        prompts: List[str] = []

        def try_parse(candidate: str) -> None:
            nonlocal prompts
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                return
            if isinstance(parsed, list):
                cleaned = [
                    str(item).strip()
                    for item in parsed
                    if isinstance(item, str) and item.strip()
                ]
                if cleaned:
                    prompts = cleaned[:expected]

        try_parse(text)
        if prompts:
            return prompts

        match = re.search(r"\[[\s\S]*?\]", text)
        if match:
            try_parse(match.group(0))
            if prompts:
                return prompts

        fallback: List[str] = []
        for line in text.splitlines():
            cleaned = line.strip().lstrip("-•* ")
            if cleaned:
                fallback.append(cleaned)
            if len(fallback) >= expected:
                break

        return fallback[:expected]

    @staticmethod
    def _strip_code_fence(block: str) -> str:
        content = block.strip()
        if content.startswith("```"):
            parts = content.split("```")
            if len(parts) >= 3:
                inner = parts[1]
                if inner.startswith("json"):
                    inner = inner[len("json") :]
                return inner.strip()
            return content.strip("`").strip()
        return content


async def run_auto_benchmark(request: AutoBenchmarkRequest) -> List[BenchmarkResult]:
    results: List[BenchmarkResult] = []

    concurrency_values = request.sweep_concurrency or list(
        range(1, int(request.max_concurrent_users) + 1)
    )
    kv_cache_values: List[int | None] = (
        request.sweep_kv_cache_mib
        if request.sweep_kv_cache_mib
        else [request.backend_parameters.kv_cache_mib]
    )

    combos = build_parameter_grid(
        request.parameters,
        concurrency_values=concurrency_values,
        max_tokens_values=request.sweep_max_tokens,
        temperature_values=request.sweep_temperature,
    )

    for kv_cache in kv_cache_values:
        backend_variant = model_copy(
            request.backend_parameters,
            update={"kv_cache_mib": kv_cache},
        )
        for params in combos:
            bench_request = BenchmarkRequest(
                provider=request.provider,
                model_name=request.model_name,
                prompt=request.prompt,
                base_url=request.base_url,
                parameters=params,
                backend_parameters=backend_variant,
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
