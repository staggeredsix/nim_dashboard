"""Lightweight evaluation harnesses for benchmark runs."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

try:
    import httpx
except ImportError:  # pragma: no cover - fallback handled elsewhere
    from .clients.base import httpx  # type: ignore

from .clients.base import BackendClient


ACCURACY_DATASET = [
    {
        "prompt": "What does NVFP4 quantization offer for NVIDIA GPUs?",
        "keywords": ["nvfp4", "latency"],
    },
    {
        "prompt": "Explain how TensorRT-LLM accelerates inference on Hopper GPUs.",
        "keywords": ["tensorrt", "hopper"],
    },
]

AGENTIC_TASKS = [
    {
        "prompt": (
            "Plan a three step workflow to download a vLLM checkpoint, quantize it with unsloth, "
            "and run an accuracy smoke test. Return the plan as a numbered list."
        ),
        "required_markers": ["1.", "2.", "3."],
    },
    {
        "prompt": "Summarize how an agent would orchestrate llama.cpp deployment with telemetry hooks.",
        "required_markers": ["agent", "telemetry"],
    },
]


@dataclass(slots=True)
class EvaluationResult:
    score: float
    details: List[Dict[str, Any]]


async def run_accuracy_suite(client: BackendClient, http_client: httpx.AsyncClient) -> EvaluationResult:
    """Query the model with curated prompts and score keyword coverage."""

    hits = 0
    details: List[Dict[str, Any]] = []
    for sample in ACCURACY_DATASET:
        metrics = await client.generate(sample["prompt"], http_client)
        completion = metrics.completion.lower()
        expected = sample["keywords"]
        matched = all(keyword.lower() in completion for keyword in expected)
        hits += 1 if matched else 0
        details.append(
            {
                "prompt": sample["prompt"],
                "response": metrics.completion,
                "matched": matched,
            }
        )
    score = hits / len(ACCURACY_DATASET) if ACCURACY_DATASET else 0.0
    return EvaluationResult(score=score, details=details)


async def run_agentic_suite(client: BackendClient, http_client: httpx.AsyncClient) -> EvaluationResult:
    """Inspect responses for structured, multi-step behaviours."""

    hits = 0
    details: List[Dict[str, Any]] = []
    for sample in AGENTIC_TASKS:
        metrics = await client.generate(sample["prompt"], http_client)
        completion = metrics.completion.lower()
        matched = all(marker.lower() in completion for marker in sample["required_markers"])
        if matched:
            hits += 1
        details.append(
            {
                "prompt": sample["prompt"],
                "response": metrics.completion,
                "matched": matched,
            }
        )
    score = hits / len(AGENTIC_TASKS) if AGENTIC_TASKS else 0.0
    return EvaluationResult(score=score, details=details)
