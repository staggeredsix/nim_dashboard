"""vLLM client implementation."""
from __future__ import annotations

import json
import time
from statistics import mean
from typing import Any, Dict, List, Optional

try:
    import httpx
except ImportError:  # pragma: no cover
    from .base import httpx  # type: ignore  # fallback proxy

from .base import BackendClient, RequestMetrics, request_with_retry


class VllmClient(BackendClient):
    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/completions"
        payload: Dict[str, Any] = {
            "model": self.model_name,
            "prompt": prompt,
            "max_tokens": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "stream": False,
            "best_of": self.backend_parameters.vllm_best_of,
        }
        if self.backend_parameters.vllm_use_beam_search:
            payload["use_beam_search"] = True

        async def _send() -> Dict[str, Any]:
            response = await client.post(url, json=payload, timeout=self.timeout)
            response.raise_for_status()
            return response.json()

        return await request_with_retry(_send)

    async def generate(self, prompt: str, client: httpx.AsyncClient) -> RequestMetrics:
        if not self.parameters.stream:
            return await super().generate(prompt, client)

        try:
            return await self._stream_generate(prompt, client)
        except ValueError:
            return await super().generate(prompt, client)

    async def _stream_generate(
        self, prompt: str, client: httpx.AsyncClient
    ) -> RequestMetrics:
        url = f"{self.base_url}/v1/completions"
        payload: Dict[str, Any] = {
            "model": self.model_name,
            "prompt": prompt,
            "max_tokens": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "stream": True,
            "best_of": self.backend_parameters.vllm_best_of,
        }
        if self.backend_parameters.vllm_use_beam_search:
            payload["use_beam_search"] = True

        start = time.perf_counter()
        completion_chunks: List[str] = []
        raw_chunks: List[Dict[str, Any]] = []
        telemetry_events: List[Dict[str, Any]] = []
        first_token_timestamp: Optional[float] = None
        previous_token_timestamp: Optional[float] = None
        inter_token_deltas: List[float] = []
        token_counter = 0

        async with client.stream(
            "POST",
            url,
            json=payload,
            timeout=self.timeout,
        ) as response:
            response.raise_for_status()
            current_event: Optional[str] = None
            async for raw_line in response.aiter_lines():
                if raw_line is None:
                    continue
                line = raw_line.strip()
                if not line:
                    current_event = None
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("event:"):
                    current_event = line[6:].strip()
                    continue
                if line.startswith("data:"):
                    line = line[5:].strip()
                if not line or line == "[DONE]":
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if current_event and current_event.lower() in {"telemetry", "metrics", "log"}:
                    telemetry_events.append({"event": current_event, "data": chunk})
                    continue

                if not isinstance(chunk, dict):
                    continue

                raw_chunks.append(chunk)
                telemetry_payload = chunk.get("telemetry")
                if isinstance(telemetry_payload, dict):
                    telemetry_events.append({"event": "telemetry", "data": telemetry_payload})
                metrics_payload = chunk.get("metrics")
                if isinstance(metrics_payload, dict):
                    telemetry_events.append({"event": "metrics", "data": metrics_payload})
                text = self._extract_stream_text(chunk)
                if text:
                    completion_chunks.append(text)
                    now = time.perf_counter()
                    if first_token_timestamp is None:
                        first_token_timestamp = now
                        previous_token_timestamp = now
                    else:
                        if previous_token_timestamp is not None:
                            inter_token_deltas.append((now - previous_token_timestamp) * 1000.0)
                        previous_token_timestamp = now
                    token_counter += 1

                tokens_hint = self._extract_token_count(chunk)
                if tokens_hint:
                    token_counter = max(token_counter, tokens_hint)

        if not raw_chunks and not telemetry_events:
            raise ValueError("Empty streaming response from vLLM")

        end = time.perf_counter()
        latency_ms = (end - start) * 1000.0
        if first_token_timestamp is not None:
            ttft_ms = (first_token_timestamp - start) * 1000.0
        else:
            ttft_ms = latency_ms
        avg_inter_token_latency_ms = mean(inter_token_deltas) if inter_token_deltas else 0.0
        completion_text = "".join(completion_chunks)

        raw_response: Dict[str, Any] = {
            "chunks": raw_chunks,
            "telemetry": telemetry_events,
            "stream": True,
        }

        return RequestMetrics(
            latency_ms=latency_ms,
            ttft_ms=ttft_ms,
            tokens_generated=token_counter,
            completion=completion_text,
            raw_response=raw_response,
            avg_inter_token_latency_ms=avg_inter_token_latency_ms,
        )
