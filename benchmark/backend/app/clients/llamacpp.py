"""llama.cpp HTTP server client implementation."""
from __future__ import annotations

from typing import Any, Dict

try:
    import httpx
except ImportError:  # pragma: no cover
    from .base import httpx  # type: ignore  # fallback proxy

from .base import BackendClient, request_with_retry


class LlamaCppClient(BackendClient):
    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        url = f"{self.base_url}/completion"
        payload: Dict[str, Any] = {
            "prompt": prompt,
            "n_predict": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "stream": self.parameters.stream,
            "repeat_penalty": self.parameters.repetition_penalty,
        }

        async def _send() -> Dict[str, Any]:
            response = await client.post(url, json=payload, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict):
                return data
            raise ValueError("Unexpected response from llama.cpp server")

        return await request_with_retry(_send)
