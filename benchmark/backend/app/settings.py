"""Application settings and configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List, Optional


def _split_origins(value: str | None) -> List[str]:
    if not value:
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


@dataclass(slots=True)
class Settings:
    api_title: str = field(default="NIM Benchmark API")
    api_version: str = field(default="1.0.0")
    allow_origins: List[str] = field(default_factory=lambda: ["*"])

    database_url: str = field(default="sqlite:///./data/benchmarks.db")

    default_timeout: float = field(default=120.0)
    request_concurrency: int = field(default=4)
    request_count: int = field(default=20)
    warmup_requests: int = field(default=2)

    ollama_base_url: str = field(default="http://localhost:11434")
    vllm_base_url: str = field(default="http://localhost:8000")
    nim_base_url: str = field(default="http://localhost:8001")
    llamacpp_base_url: str = field(default="http://localhost:8080")

    ngc_api_key: Optional[str] = field(default=None)
    hf_api_key: Optional[str] = field(default=None)
    model_cache_dir: str = field(default="./data/models")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            api_title=os.getenv("API_TITLE", "NIM Benchmark API"),
            api_version=os.getenv("API_VERSION", "1.0.0"),
            allow_origins=_split_origins(os.getenv("ALLOW_ORIGINS")),
            database_url=os.getenv("DATABASE_URL", "sqlite:///./data/benchmarks.db"),
            default_timeout=float(os.getenv("DEFAULT_TIMEOUT", "120")),
            request_concurrency=int(os.getenv("REQUEST_CONCURRENCY", "4")),
            request_count=int(os.getenv("REQUEST_COUNT", "20")),
            warmup_requests=int(os.getenv("WARMUP_REQUESTS", "2")),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            vllm_base_url=os.getenv("VLLM_BASE_URL", "http://localhost:8000"),
            nim_base_url=os.getenv("NIM_BASE_URL", "http://localhost:8001"),
            llamacpp_base_url=os.getenv("LLAMACPP_BASE_URL", "http://localhost:8080"),
            ngc_api_key=os.getenv("NGC_API_KEY"),
            hf_api_key=os.getenv("HF_API_KEY"),
            model_cache_dir=os.getenv("MODEL_CACHE_DIR", "./data/models"),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


settings = get_settings()
