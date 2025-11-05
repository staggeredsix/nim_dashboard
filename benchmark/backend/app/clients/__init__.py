"""Client factory for supported providers."""
from __future__ import annotations

from typing import Dict, Type

from ..schemas import BackendSpecificParameters, BenchmarkParameters, BenchmarkProvider
from .base import BackendClient
from .llamacpp import LlamaCppClient
from .nim import NimClient
from .ollama import OllamaClient
from .vllm import VllmClient


CLIENTS: Dict[BenchmarkProvider, Type[BackendClient]] = {
    BenchmarkProvider.OLLAMA: OllamaClient,
    BenchmarkProvider.NIM: NimClient,
    BenchmarkProvider.VLLM: VllmClient,
    BenchmarkProvider.LLAMACPP: LlamaCppClient,
}


def create_client(
    provider: BenchmarkProvider,
    *,
    base_url: str,
    model_name: str,
    parameters: BenchmarkParameters,
    backend_parameters: BackendSpecificParameters,
    timeout: float,
    api_key: str | None,
) -> BackendClient:
    client_cls = CLIENTS.get(provider)
    if not client_cls:
        raise ValueError(f"Unsupported provider: {provider}")
    return client_cls(
        base_url=base_url,
        model_name=model_name,
        parameters=parameters,
        backend_parameters=backend_parameters,
        timeout=timeout,
        api_key=api_key,
    )
