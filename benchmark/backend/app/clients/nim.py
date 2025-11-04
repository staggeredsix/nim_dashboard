"""NVIDIA Inference Microservice (NIM) client implementation."""
from __future__ import annotations

from typing import Any, Dict, Optional

try:
    import httpx
except ImportError:  # pragma: no cover
    from .base import httpx  # type: ignore  # fallback proxy from base module

from .base import BackendClient, request_with_retry


class NimClient(BackendClient):
    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.ngc_api_key:
            headers["Authorization"] = f"Bearer {self.ngc_api_key}"
        return headers

    async def _generate(self, prompt: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/completions"
        payload: Dict[str, Any] = {
            "model": self.backend_parameters.nim_model_name or self.model_name,
            "prompt": prompt,
            "max_tokens": self.parameters.max_tokens,
            "temperature": self.parameters.temperature,
            "top_p": self.parameters.top_p,
            "stream": self.parameters.stream,
            "repetition_penalty": self.parameters.repetition_penalty,
        }

        async def _send() -> Dict[str, Any]:
            response = await client.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()

        return await request_with_retry(_send)
