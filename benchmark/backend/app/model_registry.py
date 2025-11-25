"""Utilities for managing provider specific model catalogs and runtimes."""
from __future__ import annotations

import asyncio
import pathlib
import shutil
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

import httpx
from fastapi import HTTPException, UploadFile

try:  # Optional dependency used for Hugging Face downloads
    from huggingface_hub import HfApi, snapshot_download
except ImportError:  # pragma: no cover - optional dependency
    HfApi = None  # type: ignore
    snapshot_download = None  # type: ignore

from .schemas import (
    BenchmarkProvider,
    HuggingFaceDownloadRequest,
    HuggingFaceSearchRequest,
    ModelActionResponse,
    ModelInfo,
    ModelRuntimeInfo,
    ModelRuntimeListResponse,
    ModelRuntimeRequest,
    NimPullRequest,
    NimSearchRequest,
    OllamaPullRequest,
)
from .settings import Settings
from .utils import model_dump


class ModelRegistryService:
    """Provides helper methods for model discovery and download flows."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def list_ollama_models(self, base_url: Optional[str] = None) -> List[ModelInfo]:
        base_url = (base_url or self.settings.ollama_base_url).rstrip("/")
        url = f"{base_url}/api/tags"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
        payload = response.json()
        models: List[ModelInfo] = []
        for item in payload.get("models", []):
            name = item.get("name") or item.get("model")
            if not isinstance(name, str):
                continue
            models.append(
                ModelInfo(
                    name=name,
                    size=_format_size(item.get("size")),
                    digest=item.get("digest"),
                    description=item.get("details"),
                )
            )
        return models

    async def pull_ollama_model(self, request: OllamaPullRequest) -> ModelActionResponse:
        base_url = (request.base_url or self.settings.ollama_base_url).rstrip("/")
        url = f"{base_url}/api/pull"
        payload = {"name": request.model_name, "stream": request.stream}
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        data = response.json()
        status = data.get("status")
        detail = data.get("status") or data.get("detail") or "Pull completed"
        return ModelActionResponse(
            status="completed" if status in {"success", "completed"} else "failed",
            detail=detail,
            metadata=data,
        )

    async def search_nim_models(self, request: NimSearchRequest) -> List[ModelInfo]:
        api_key = request.api_key or self.settings.ngc_api_key
        if not api_key:
            raise HTTPException(status_code=400, detail="NGC API key is required to query NIM models")

        url = f"https://api.ngc.nvidia.com/v2/models/org/{request.organization}"
        params = {"pageSize": request.limit}
        if request.query:
            params["query"] = request.query

        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, headers=headers)
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Organization not found on NGC")
            response.raise_for_status()

        data = response.json()
        items = data.get("models") or data.get("resources") or []

        models: List[ModelInfo] = []
        for item in items:
            name = item.get("name") or item.get("displayName")
            if not isinstance(name, str):
                continue
            description = item.get("description")
            if not isinstance(description, str):
                description = None
            version = None
            if "latestVersion" in item and isinstance(item["latestVersion"], dict):
                version = item["latestVersion"].get("version")
            elif isinstance(item.get("version"), str):
                version = item.get("version")
            models.append(
                ModelInfo(
                    name=name,
                    description=description,
                    version=version,
                )
            )
        return models

    async def pull_nim_model(self, request: NimPullRequest) -> ModelActionResponse:
        api_key = request.api_key or self.settings.ngc_api_key
        if not api_key:
            raise HTTPException(status_code=400, detail="NGC API key is required to download NIM models")

        if shutil.which("docker") is None:
            raise HTTPException(status_code=500, detail="Docker CLI is required to pull NIM containers")

        repository = request.model_name
        if request.tag:
            repository = f"{repository}:{request.tag}"

        login_cmd = ["docker", "login", "nvcr.io", "-u", "$oauthtoken", "--password-stdin"]
        pull_cmd = ["docker", "pull", repository]

        await _run_command(login_cmd, input_data=f"{api_key}\n")
        pull_output = await _run_command(pull_cmd)

        return ModelActionResponse(status="completed", detail="Docker pull succeeded", metadata={"output": pull_output})

    async def search_huggingface_models(
        self, request: HuggingFaceSearchRequest
    ) -> List[ModelInfo]:
        if HfApi is None:
            raise HTTPException(status_code=500, detail="huggingface-hub is not installed on the backend")

        api = HfApi(token=request.api_key or self.settings.hf_api_key)
        try:
            models = await asyncio.to_thread(
                lambda: list(api.list_models(search=request.query, limit=request.limit))
            )
        except Exception as exc:  # noqa: BLE001 - surface API errors to caller
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        result: List[ModelInfo] = []
        for model in models:
            last_modified = getattr(model, "lastModified", None)
            version = getattr(model, "sha", None)
            result.append(
                ModelInfo(
                    name=model.modelId,
                    description=getattr(model, "description", None),
                    version=str(version) if version else None,
                    size=str(last_modified) if last_modified else None,
                )
            )
        return result

    async def download_huggingface_model(
        self, request: HuggingFaceDownloadRequest
    ) -> ModelActionResponse:
        if snapshot_download is None:
            raise HTTPException(status_code=500, detail="huggingface-hub is not installed on the backend")

        token = request.api_key or self.settings.hf_api_key
        if not token:
            raise HTTPException(status_code=400, detail="Hugging Face API key is required for gated models")

        target_dir = pathlib.Path(request.local_dir or self.settings.model_cache_dir)
        target_dir.mkdir(parents=True, exist_ok=True)

        try:
            path = await asyncio.to_thread(
                snapshot_download,
                repo_id=request.model_id,
                revision=request.revision,
                local_dir=str(target_dir),
                token=token,
                local_dir_use_symlinks=False,
            )
        except Exception as exc:  # noqa: BLE001 - propagate download failures
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return ModelActionResponse(
            status="completed",
            detail="Model downloaded successfully",
            metadata={"path": str(path)},
        )

    async def upload_local_model(
        self,
        *,
        provider: BenchmarkProvider,
        directory_name: str,
        file: UploadFile,
        postprocess: Optional[List[str]] = None,
    ) -> ModelActionResponse:
        if provider not in {
            BenchmarkProvider.LLAMACPP,
            BenchmarkProvider.VLLM,
        }:
            raise HTTPException(
                status_code=400,
                detail="Raw model upload is only supported for llama.cpp and vLLM",
            )

        target_root = pathlib.Path(self.settings.model_cache_dir)
        target_dir = target_root / directory_name
        target_dir.mkdir(parents=True, exist_ok=True)

        target_path = target_dir / file.filename
        contents = await file.read()
        target_path.write_bytes(contents)

        applied_steps: List[str] = []
        failed_steps: List[str] = []
        for step in postprocess or []:
            command = _postprocess_command(step, target_dir)
            if not command:
                failed_steps.append(step)
                continue
            try:
                await _run_command(command)
                applied_steps.append(step)
            except HTTPException:
                failed_steps.append(step)

        detail = f"Uploaded {file.filename} to {target_dir}"
        if applied_steps:
            detail += f"; steps applied: {', '.join(applied_steps)}"
        if failed_steps:
            detail += f"; missing tooling for: {', '.join(failed_steps)}"

        return ModelActionResponse(
            status="completed",
            detail=detail,
            metadata={
                "path": str(target_path),
                "directory": str(target_dir),
                "postprocess_completed": applied_steps,
                "postprocess_failed": failed_steps,
            },
        )


class ModelRuntimeService:
    """Tracks and manages runtime state for provider models."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._lock = asyncio.Lock()
        self._running: Dict[BenchmarkProvider, Dict[str, ModelRuntimeInfo]] = defaultdict(dict)

    def _default_base_url(self, provider: BenchmarkProvider) -> str:
        if provider is BenchmarkProvider.OLLAMA:
            return self.settings.ollama_base_url
        if provider is BenchmarkProvider.NIM:
            return self.settings.nim_base_url
        if provider is BenchmarkProvider.VLLM:
            return self.settings.vllm_base_url
        if provider is BenchmarkProvider.LLAMACPP:
            return self.settings.llamacpp_base_url
        raise ValueError(f"Unsupported provider {provider}")

    async def start_model(self, request: ModelRuntimeRequest) -> ModelActionResponse:
        base_url = (request.base_url or self._default_base_url(request.provider)).rstrip("/")
        info = ModelRuntimeInfo(
            provider=request.provider,
            model_name=request.model_name,
            base_url=base_url,
            started_at=datetime.utcnow().isoformat(),
            kv_cache_mib=request.kv_cache_mib,
            model_path=request.model_path,
        )

        async with self._lock:
            self._running[request.provider][request.model_name] = info

        detail = f"Marked {request.model_name} as running for {request.provider.value}"
        return ModelActionResponse(status="running", detail=detail, metadata=model_dump(info))

    async def stop_model(self, request: ModelRuntimeRequest) -> ModelActionResponse:
        async with self._lock:
            provider_models = self._running.get(request.provider, {})
            existing = provider_models.pop(request.model_name, None)
            if existing is None:
                detail = f"Model {request.model_name} was not registered as running"
                return ModelActionResponse(status="missing", detail=detail, metadata=None)

        detail = f"Stopped tracking {request.model_name} for {request.provider.value}"
        return ModelActionResponse(status="stopped", detail=detail, metadata=model_dump(existing))

    async def list_runtimes(self) -> ModelRuntimeListResponse:
        async with self._lock:
            runtimes: List[ModelRuntimeInfo] = []
            for provider_models in self._running.values():
                runtimes.extend(provider_models.values())

        runtimes.sort(key=lambda info: info.started_at, reverse=True)
        return ModelRuntimeListResponse(runtimes=runtimes)


async def _run_command(cmd: List[str], input_data: Optional[str] = None) -> str:
    """Execute a command asynchronously and capture its output."""

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if input_data else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate(
        input=input_data.encode() if input_data else None
    )
    if process.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Command {' '.join(cmd)} failed: {stderr.decode() or stdout.decode()}",
        )
    output = stdout.decode().strip()
    if stderr:
        output = f"{output}\n{stderr.decode().strip()}".strip()
    return output


def _postprocess_command(step: str, target_dir: pathlib.Path) -> List[str] | None:
    """Return a best-effort command for optional post-processing steps."""

    scripts_dir = pathlib.Path("./scripts")
    step = step.lower()
    if step == "llamacpp_quantize":
        script = scripts_dir / "llamacpp_quantize.sh"
        if script.exists():
            return ["bash", str(script), str(target_dir)]
    if step == "unsloth_optimize":
        script = scripts_dir / "unsloth_optimize.sh"
        if script.exists():
            return ["bash", str(script), str(target_dir)]
    if step == "trt_llm_convert":
        script = scripts_dir / "trt_llm_convert.sh"
        if script.exists():
            return ["bash", str(script), str(target_dir)]
    return None


def _format_size(value: Optional[object]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        # Convert bytes to a human readable string
        size = float(value)
        suffixes = ["B", "KB", "MB", "GB", "TB"]
        idx = 0
        while size >= 1024 and idx < len(suffixes) - 1:
            size /= 1024
            idx += 1
        return f"{size:.1f} {suffixes[idx]}"
    if isinstance(value, str):
        return value
    return str(value)
