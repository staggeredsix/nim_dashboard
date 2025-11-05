"""llama.cpp HTTP server client implementation."""
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


class LlamaCppClient(BackendClient):
    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def _send_chat_request(
        self,
        prompt: str,
        client: httpx.AsyncClient,
        headers: Dict[str, str],
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/chat/completions"
        payload: Dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "stream": False,
        }
        options: Dict[str, Any] = {
            "repeat_penalty": self.parameters.repetition_penalty,
        }
        # Avoid sending empty options object to servers that do not support it.
        if options:
            payload["options"] = options

        response = await client.post(
            url,
            json=payload,
            headers=headers,
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict):
            return data
        raise ValueError("Unexpected response from llama.cpp chat endpoint")

    async def _send_legacy_request(
        self,
        prompt: str,
        client: httpx.AsyncClient,
        headers: Dict[str, str],
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/completion"
        payload: Dict[str, Any] = {
            "prompt": prompt,
            "n_predict": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "repeat_penalty": self.parameters.repetition_penalty,
            "stream": False,
        }

        response = await client.post(
            url,
            json=payload,
            headers=headers,
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict):
            return data
        raise ValueError("Unexpected response from llama.cpp legacy endpoint")

    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        headers = self._headers()

        async def _send() -> Dict[str, Any]:
            try:
                return await self._send_chat_request(prompt, client, headers)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in {404, 405}:  # pragma: no cover - fallback path
                    return await self._send_legacy_request(prompt, client, headers)
                raise

        return await request_with_retry(_send)

    async def generate(self, prompt: str, client: httpx.AsyncClient) -> RequestMetrics:
        if not self.parameters.stream:
            return await super().generate(prompt, client)

        headers = self._headers()
        try:
            return await self._stream_generate(prompt, client, headers, use_chat=True)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {404, 405}:  # pragma: no cover - fallback path
                return await self._stream_generate(prompt, client, headers, use_chat=False)
            raise
        except ValueError:
            # Fall back to a non-streaming measurement if the server cannot stream
            return await super().generate(prompt, client)

    async def _stream_generate(
        self,
        prompt: str,
        client: httpx.AsyncClient,
        headers: Dict[str, str],
        use_chat: bool,
    ) -> RequestMetrics:
        if use_chat:
            url = f"{self.base_url}/v1/chat/completions"
            payload: Dict[str, Any] = {
                "model": self.model_name,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": self.parameters.max_tokens,
                "temperature": self.parameters.temperature,
                "top_p": self.parameters.top_p,
                "stream": True,
            }
            options: Dict[str, Any] = {
                "repeat_penalty": self.parameters.repetition_penalty,
            }
            if options:
                payload["options"] = options
            endpoint = "chat"
        else:
            url = f"{self.base_url}/completion"
            payload = {
                "prompt": prompt,
                "n_predict": self.parameters.max_tokens,
                "temperature": self.parameters.temperature,
                "top_p": self.parameters.top_p,
                "repeat_penalty": self.parameters.repetition_penalty,
                "stream": True,
            }
            endpoint = "legacy"

        start = time.perf_counter()
        completion_chunks: List[str] = []
        raw_chunks: List[Dict[str, Any]] = []
        first_token_timestamp: Optional[float] = None
        previous_token_timestamp: Optional[float] = None
        inter_token_deltas: List[float] = []
        token_counter = 0

        try:
            async with client.stream(
                "POST",
                url,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("data:"):
                        line = line[5:].strip()
                    if not line or line == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if not isinstance(chunk, dict):
                        continue

                    raw_chunks.append(chunk)
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
                        # Fall back to counting chunks if the backend does not report tokens
                        token_counter += 1

                    tokens_hint = self._extract_token_count(chunk)
                    if tokens_hint:
                        token_counter = max(token_counter, tokens_hint)
        except (httpx.ReadError, httpx.RemoteProtocolError) as exc:
            if not raw_chunks:
                raise ValueError("Empty streaming response") from exc
            # Allow partial streams from llama.cpp when the connection closes early
            pass

        if not raw_chunks:
            raise ValueError("Empty streaming response")

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
            "endpoint": endpoint,
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

