from pathlib import Path
from typing import Any, List

import httpx
import pytest
from fastapi import HTTPException

from app.model_registry import ModelRegistryService
from app.schemas import (
    HuggingFaceDownloadRequest,
    HuggingFaceSearchRequest,
    NimPullRequest,
    NimSearchRequest,
    OllamaPullRequest,
)
from app.settings import Settings


class StubResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Any:  # pragma: no cover - trivial
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)


def make_async_client(responses: List[StubResponse]):
    class _AsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:  # pragma: no cover - simple holder
            self._responses = list(responses)

        async def __aenter__(self) -> "_AsyncClient":
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def get(self, *args: Any, **kwargs: Any) -> StubResponse:
            return self._responses.pop(0)

        async def post(self, *args: Any, **kwargs: Any) -> StubResponse:
            return self._responses.pop(0)

    return _AsyncClient


@pytest.mark.asyncio
async def test_list_ollama_models(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings()
    service = ModelRegistryService(settings)

    response = StubResponse({"models": [{"name": "llama3", "size": 1048576}]})
    monkeypatch.setattr("app.model_registry.httpx.AsyncClient", make_async_client([response]))

    models = await service.list_ollama_models()
    assert len(models) == 1
    assert models[0].name == "llama3"
    assert models[0].size is not None


@pytest.mark.asyncio
async def test_pull_ollama_model(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings()
    service = ModelRegistryService(settings)

    response = StubResponse({"status": "success", "digest": "123"})
    monkeypatch.setattr("app.model_registry.httpx.AsyncClient", make_async_client([response]))

    result = await service.pull_ollama_model(OllamaPullRequest(model_name="llama2"))
    assert result.status == "completed"
    assert "success" in result.detail.lower()


@pytest.mark.asyncio
async def test_search_nim_models_requires_key() -> None:
    settings = Settings()
    service = ModelRegistryService(settings)

    with pytest.raises(HTTPException) as exc:
        await service.search_nim_models(NimSearchRequest(api_key=None))
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_pull_nim_model_requires_docker(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings()
    service = ModelRegistryService(settings)

    monkeypatch.setattr("app.model_registry.shutil.which", lambda _: None)

    with pytest.raises(HTTPException) as exc:
        await service.pull_nim_model(NimPullRequest(model_name="nvcr.io/nim/test", api_key="token"))
    assert exc.value.status_code == 500


@pytest.mark.asyncio
async def test_download_huggingface_model(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    settings = Settings(model_cache_dir=str(tmp_path))
    service = ModelRegistryService(settings)

    called = {}

    def _snapshot_download(**kwargs: Any) -> str:  # type: ignore[override]
        called.update(kwargs)
        (tmp_path / "model").mkdir(exist_ok=True)
        return str(tmp_path / "model")

    monkeypatch.setattr("app.model_registry.snapshot_download", _snapshot_download)

    result = await service.download_huggingface_model(
        HuggingFaceDownloadRequest(model_id="meta-llama/Meta-Llama-3-8B", api_key="key")
    )

    assert result.status == "completed"
    assert "model" in result.metadata["path"]
    assert called["repo_id"] == "meta-llama/Meta-Llama-3-8B"


@pytest.mark.asyncio
async def test_search_huggingface_models(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings()
    service = ModelRegistryService(settings)

    class _Model:
        def __init__(self, model_id: str) -> None:
            self.modelId = model_id
            self.description = "demo"
            self.sha = "abc123"
            self.lastModified = "2024-01-01"

    def _list_models(**kwargs: Any) -> List[_Model]:  # type: ignore[override]
        return [_Model("org/model")]

    class _Api:
        def __init__(self, **kwargs: Any) -> None:  # pragma: no cover - storing kwargs not needed
            self.kwargs = kwargs

        def list_models(self, **kwargs: Any) -> List[_Model]:  # type: ignore[override]
            return _list_models(**kwargs)

    monkeypatch.setattr("app.model_registry.HfApi", lambda **kwargs: _Api(**kwargs))

    models = await service.search_huggingface_models(HuggingFaceSearchRequest(api_key="token"))
    assert len(models) == 1
    assert models[0].name == "org/model"
