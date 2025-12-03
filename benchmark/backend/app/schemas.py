"""Pydantic schemas for API payloads."""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import AnyHttpUrl, BaseModel, Field, PositiveInt, conint


class BenchmarkProvider(str, Enum):
    OLLAMA = "ollama"
    NIM = "nim"
    VLLM = "vllm"
    LLAMACPP = "llamacpp"


class BackendMetadata(BaseModel):
    name: str
    provider: BenchmarkProvider
    default_base_url: AnyHttpUrl
    description: str
    parameters: Dict[str, Any]


class BenchmarkParameters(BaseModel):
    request_count: PositiveInt = Field(default=20)
    concurrency: conint(ge=1, le=256) = Field(default=4)
    warmup_requests: conint(ge=0, le=100) = Field(default=2)
    max_tokens: PositiveInt = Field(default=512)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    repetition_penalty: float = Field(default=1.0, ge=0.0)
    stream: bool = Field(default=True)
    timeout: float = Field(default=120.0, gt=0)


class BackendSpecificParameters(BaseModel):
    nim_model_name: Optional[str] = Field(
        default=None,
        description="Override for the deployed NIM model identifier.",
    )
    ollama_keep_alive: Optional[str] = Field(default="5m")
    vllm_best_of: Optional[int] = Field(default=1)
    vllm_use_beam_search: Optional[bool] = Field(default=False)


class BenchmarkRequest(BaseModel):
    provider: BenchmarkProvider
    model_name: str
    base_url: Optional[AnyHttpUrl] = None
    prompt: str = Field(default="Summarize the importance of TensorRT-LLM when deploying large language models in production environments.")
    use_random_prompts: bool = Field(
        default=False,
        description="When enabled the backend will ask the model to generate random prompts before benchmarking.",
    )
    random_prompt_count: conint(ge=1, le=100) = Field(
        default=5,
        description="Number of random prompts to request from the model when generation is enabled.",
    )
    parameters: BenchmarkParameters = Field(default_factory=BenchmarkParameters)
    backend_parameters: BackendSpecificParameters = Field(default_factory=BackendSpecificParameters)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AutoBenchmarkRequest(BaseModel):
    provider: BenchmarkProvider
    model_name: str
    prompt: str
    base_url: Optional[AnyHttpUrl] = None
    sweep_concurrency: List[int] = Field(default_factory=lambda: [1, 2, 4])
    sweep_max_tokens: List[int] = Field(default_factory=lambda: [256, 512])
    sweep_temperature: List[float] = Field(default_factory=lambda: [0.1, 0.5])
    parameters: BenchmarkParameters = Field(default_factory=BenchmarkParameters)
    backend_parameters: BackendSpecificParameters = Field(default_factory=BackendSpecificParameters)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BenchmarkRunResponse(BaseModel):
    id: int
    status: str


class BenchmarkResult(BaseModel):
    run_id: int
    provider: BenchmarkProvider
    model_name: str
    parameters: Dict[str, Any]
    metrics: Dict[str, Any]


class BenchmarkHistoryItem(BaseModel):
    id: int
    provider: BenchmarkProvider
    model_name: str
    status: str
    created_at: str
    completed_at: Optional[str]
    metrics: Optional[Dict[str, Any]]
    error: Optional[str]


class PaginatedBenchmarkHistory(BaseModel):
    runs: List[BenchmarkHistoryItem]
    total: int


class ErrorResponse(BaseModel):
    detail: str


class ModelInfo(BaseModel):
    """Describes a model known to a provider registry."""

    name: str
    size: Optional[str] = None
    digest: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None


class ModelListResponse(BaseModel):
    provider: BenchmarkProvider
    models: List[ModelInfo]


class OllamaPullRequest(BaseModel):
    model_name: str
    base_url: Optional[AnyHttpUrl] = None
    stream: bool = Field(default=False)


class ModelRuntimeRequest(BaseModel):
    provider: BenchmarkProvider
    model_name: str
    base_url: Optional[AnyHttpUrl] = None


class ModelRuntimeInfo(BaseModel):
    provider: BenchmarkProvider
    model_name: str
    base_url: AnyHttpUrl
    started_at: str


class ModelRuntimeListResponse(BaseModel):
    runtimes: List[ModelRuntimeInfo]


class NimSearchRequest(BaseModel):
    api_key: Optional[str] = None
    query: Optional[str] = Field(default=None, description="Filter models by a search term.")
    limit: conint(ge=1, le=200) = Field(default=25)
    organization: str = Field(default="nvidia", description="NGC organization to inspect.")


class NimPullRequest(BaseModel):
    model_name: str = Field(description="Container image name, e.g. nvcr.io/nim/llama2-13b.")
    tag: Optional[str] = Field(default="latest")
    api_key: Optional[str] = None


class HuggingFaceSearchRequest(BaseModel):
    api_key: Optional[str] = None
    query: Optional[str] = Field(default=None, description="Free-text search expression")
    limit: conint(ge=1, le=100) = Field(default=20)


class HuggingFaceDownloadRequest(BaseModel):
    model_id: str
    api_key: Optional[str] = None
    revision: Optional[str] = None
    local_dir: Optional[str] = Field(default=None, description="Override the download destination directory")


class NgcCliModelRequest(BaseModel):
    api_key: str = Field(description="NGC API key used by the NGC CLI")
    pull_command: str = Field(description="Full NGC CLI command to download the model")
    model_name: str = Field(description="Local name for the downloaded model")
    enable_trt_llm: bool = Field(
        default=False,
        description="Toggle the TensorRT-LLM pipeline for supported backends",
    )
    backends: List[str] = Field(
        default_factory=lambda: ["llamacpp", "ollama", "sglang", "vllm"],
        description="Backends that should be configured for the downloaded model",
    )


class ModelActionResponse(BaseModel):
    status: str
    detail: str
    metadata: Optional[Dict[str, Any]] = None
