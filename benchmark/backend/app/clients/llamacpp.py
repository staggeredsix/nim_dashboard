"""llama.cpp HTTP server client implementation."""
from __future__ import annotations

from typing import Any, Dict

try:
    import httpx
except ImportError:  # pragma: no cover
    from .base import httpx  # type: ignore  # fallback proxy

from .base import BackendClient, request_with_retry


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
