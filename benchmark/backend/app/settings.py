"""Application settings and configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import List, Optional


def _running_in_container() -> bool:
    """Best-effort detection of containerised execution."""
    if os.path.exists("/.dockerenv"):
        return True
    try:
        with open("/proc/1/cgroup", "r", encoding="utf-8") as handle:
            data = handle.read()
    except OSError:
        return False
    return "docker" in data or "kubepods" in data


def _default_backend_base_url(port: int) -> str:
    """Generate a base URL for services that may run outside the container."""
    if _running_in_container():
        # Docker for Linux does not expose host.docker.internal unless the entry
        # is explicitly mapped. The docker-compose manifest adds the mapping so
        # favour it when we detect a containerised runtime.
        return f"http://host.docker.internal:{port}"
    return f"http://localhost:{port}"


def _default_ollama_base_url() -> str:
    """Return a sensible Ollama base URL for the current environment."""
    return _default_backend_base_url(11434)


def _default_vllm_base_url() -> str:
    """Return a sensible vLLM base URL for the current environment."""
    return _default_backend_base_url(8000)


def _default_nim_base_url() -> str:
    """Return a sensible NVIDIA NIM base URL for the current environment."""
    return _default_backend_base_url(8001)


def _default_llamacpp_base_url() -> str:
    """Return a sensible llama.cpp base URL for the current environment."""
    return _default_backend_base_url(8080)


def _split_origins(value: str | None) -> List[str]:
    if not value:
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def _default_frontend_base_url() -> str:
    """Return the default dashboard location for browser redirects."""

    # The frontend is exposed on port 5173 in docker-compose and local dev.
    return "http://localhost:5173"


def _default_frontend_dist_path() -> str | None:
    """Return the built frontend path when it exists locally."""

    candidate = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if candidate.exists():
        return str(candidate)
    return None


@dataclass(slots=True)
class Settings:
    api_title: str = field(default="NIM Benchmark API")
    api_version: str = field(default="1.0.0")
    allow_origins: List[str] = field(default_factory=lambda: ["*"])
    frontend_base_url: str = field(default_factory=_default_frontend_base_url)
    frontend_dist_path: Optional[str] = field(default_factory=_default_frontend_dist_path)

    database_url: str = field(default="sqlite:///./data/benchmarks.db")

    default_timeout: float = field(default=120.0)
    request_concurrency: int = field(default=4)
    request_count: int = field(default=20)
    warmup_requests: int = field(default=2)

    ollama_base_url: str = field(default_factory=_default_ollama_base_url)
    vllm_base_url: str = field(default_factory=_default_vllm_base_url)
    nim_base_url: str = field(default_factory=_default_nim_base_url)
    llamacpp_base_url: str = field(default_factory=_default_llamacpp_base_url)

    ngc_api_key: Optional[str] = field(default=None)
    llamacpp_api_key: Optional[str] = field(default=None)
    hf_api_key: Optional[str] = field(default=None)
    model_cache_dir: str = field(default="./data/models")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            api_title=os.getenv("API_TITLE", "NIM Benchmark API"),
            api_version=os.getenv("API_VERSION", "1.0.0"),
            allow_origins=_split_origins(os.getenv("ALLOW_ORIGINS")),
            frontend_base_url=os.getenv("FRONTEND_BASE_URL", _default_frontend_base_url()),
            frontend_dist_path=os.getenv("FRONTEND_DIST_PATH", _default_frontend_dist_path()),
            database_url=os.getenv("DATABASE_URL", "sqlite:///./data/benchmarks.db"),
            default_timeout=float(os.getenv("DEFAULT_TIMEOUT", "120")),
            request_concurrency=int(os.getenv("REQUEST_CONCURRENCY", "4")),
            request_count=int(os.getenv("REQUEST_COUNT", "20")),
            warmup_requests=int(os.getenv("WARMUP_REQUESTS", "2")),
            ollama_base_url=os.getenv(
                "OLLAMA_BASE_URL", _default_ollama_base_url()
            ),
            vllm_base_url=os.getenv("VLLM_BASE_URL", _default_vllm_base_url()),
            nim_base_url=os.getenv("NIM_BASE_URL", _default_nim_base_url()),
            llamacpp_base_url=os.getenv(
                "LLAMACPP_BASE_URL", _default_llamacpp_base_url()
            ),
            ngc_api_key=os.getenv("NGC_API_KEY"),
            llamacpp_api_key=os.getenv("LLAMACPP_API_KEY"),
            hf_api_key=os.getenv("HF_API_KEY"),
            model_cache_dir=os.getenv("MODEL_CACHE_DIR", "./data/models"),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


settings = get_settings()
