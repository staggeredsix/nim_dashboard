"""Ollama client implementation."""
from __future__ import annotations

from typing import Any, Dict

try:
    import httpx
except ImportError:  # pragma: no cover
    from .base import httpx  # type: ignore  # fallback proxy

from .base import BackendClient, request_with_retry


class OllamaClient(BackendClient):
    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        url = f"{self.base_url}/api/generate"
        payload: Dict[str, Any] = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": self.parameters.stream,
            "keep_alive": self.backend_parameters.ollama_keep_alive,
            "options": {
                "temperature": self.parameters.temperature,
                "top_p": self.parameters.top_p,
                "num_predict": self.parameters.max_tokens,
            },
        }

        async def _send() -> Dict[str, Any]:
            response = await client.post(url, json=payload, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            if "response" in data and isinstance(data["response"], str):
                return data
            # Some Ollama deployments stream tokens. Aggregate if needed.
            if isinstance(data, dict):
                return data
            raise ValueError("Unexpected response from Ollama")

        return await request_with_retry(_send)
