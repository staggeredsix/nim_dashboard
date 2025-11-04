"""Backend client interfaces."""
from __future__ import annotations

import abc
import asyncio
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

try:
    import httpx
except ImportError:  # pragma: no cover - fallback for environments without httpx
    class _HttpxProxy:
        def __getattr__(self, item):  # noqa: D401 - simple runtime guard
            raise RuntimeError(
                "The httpx package is required to execute network operations. "
                "Install it with 'pip install httpx'."
            )

    httpx = _HttpxProxy()  # type: ignore

from ..schemas import BackendSpecificParameters, BenchmarkParameters


@dataclass(slots=True)
class RequestMetrics:
    latency_ms: float
    ttft_ms: float
    tokens_generated: int
    completion: str
    raw_response: Dict[str, Any]


class BackendClient(abc.ABC):
    """Abstract interface for provider specific clients."""

    def __init__(
        self,
        base_url: str,
        model_name: str,
        parameters: BenchmarkParameters,
        backend_parameters: BackendSpecificParameters,
        timeout: float,
        ngc_api_key: Optional[str] = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.parameters = parameters
        self.backend_parameters = backend_parameters
        self.timeout = timeout
        self.ngc_api_key = ngc_api_key

    async def warmup(self, prompt: str, client: httpx.AsyncClient) -> None:
        """Execute a warm-up inference that is not included in measurements."""
        for _ in range(self.parameters.warmup_requests):
            await self._generate(prompt=prompt, client=client)

    async def generate(self, prompt: str, client: httpx.AsyncClient) -> RequestMetrics:
        start = time.perf_counter()
        response = await self._generate(prompt=prompt, client=client)
        end = time.perf_counter()

        latency_ms = (end - start) * 1000.0
        ttft_ms = response.get("ttft_ms") or latency_ms
        tokens_generated = self._extract_token_count(response)
        completion = self._extract_completion_text(response)

        return RequestMetrics(
            latency_ms=latency_ms,
            ttft_ms=ttft_ms,
            tokens_generated=tokens_generated,
            completion=completion,
            raw_response=response,
        )

    @abc.abstractmethod
    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        raise NotImplementedError

    def _extract_token_count(self, response: Dict[str, Any]) -> int:
        candidates = [
            response.get("tokens"),
            response.get("num_tokens"),
            response.get("token_count"),
        ]
        if "usage" in response:
            usage = response["usage"]
            candidates.extend([
                usage.get("total_tokens"),
                usage.get("completion_tokens"),
            ])
        for candidate in candidates:
            if isinstance(candidate, int):
                return candidate
        return 0

    def _extract_completion_text(self, response: Dict[str, Any]) -> str:
        if "response" in response and isinstance(response["response"], str):
            return response["response"]
        if "choices" in response:
            choices = response["choices"]
            if isinstance(choices, list) and choices:
                choice = choices[0]
                if isinstance(choice, dict):
                    text = choice.get("text")
                    if isinstance(text, str):
                        return text
                    message = choice.get("message")
                    if isinstance(message, dict):
                        content = message.get("content")
                        if isinstance(content, str):
                            return content
        return ""


async def request_with_retry(
    request_callable,
    *,
    retries: int = 2,
    backoff: float = 0.5,
) -> Any:
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            return await request_callable()
        except Exception as exc:  # noqa: BLE001 intentionally broad to retry
            last_error = exc
            if attempt >= retries:
                raise
            await asyncio.sleep(backoff * (attempt + 1))
    if last_error:
        raise last_error
