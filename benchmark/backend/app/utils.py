"""Utility helpers for Pydantic compatibility."""
from __future__ import annotations

from typing import Any


def model_dump(model: Any) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    raise TypeError(f"Object {model!r} does not support model dumping")


def model_copy(model: Any, *, update: dict) -> Any:
    if hasattr(model, "model_copy"):
        return model.model_copy(update=update)
    if hasattr(model, "copy"):
        return model.copy(update=update)
    raise TypeError(f"Object {model!r} does not support model copying")
