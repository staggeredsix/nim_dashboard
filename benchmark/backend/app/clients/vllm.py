"""vLLM client implementation."""
from __future__ import annotations

from typing import Any, Dict

try:
    import httpx
except ImportError:  # pragma: no cover
    from .base import httpx  # type: ignore  # fallback proxy

from .base import BackendClient, request_with_retry


class VllmClient(BackendClient):
    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/completions"
        payload: Dict[str, Any] = {
            "model": self.model_name,
            "prompt": prompt,
            "max_tokens": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "stream": self.parameters.stream,
            "best_of": self.backend_parameters.vllm_best_of,
        }
        if self.backend_parameters.vllm_use_beam_search:
            payload["use_beam_search"] = True

        async def _send() -> Dict[str, Any]:
            response = await client.post(url, json=payload, timeout=self.timeout)
            response.raise_for_status()
            return response.json()

        return await request_with_retry(_send)
