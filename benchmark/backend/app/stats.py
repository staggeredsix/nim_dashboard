"""Utility helpers for computing benchmark statistics."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import mean
from typing import Dict, List

from .clients.base import RequestMetrics


@dataclass
class StatsAccumulator:
    latencies: List[float] = field(default_factory=list)
    ttfts: List[float] = field(default_factory=list)
    tokens: List[int] = field(default_factory=list)

    def add(self, metrics: RequestMetrics) -> None:
        self.latencies.append(metrics.latency_ms)
        self.ttfts.append(metrics.ttft_ms)
        self.tokens.append(metrics.tokens_generated)

    def summarize(self) -> Dict[str, float]:
        if not self.latencies:
            return {
                "requests_total": 0,
                "latency_p50_ms": 0.0,
                "latency_p95_ms": 0.0,
                "ttft_avg_ms": 0.0,
                "tokens_per_second": 0.0,
                "tokens_total": 0,
            }

        sorted_latencies = sorted(self.latencies)
        p50 = percentile(sorted_latencies, 50)
        p95 = percentile(sorted_latencies, 95)
        total_tokens = sum(self.tokens)
        total_time_s = sum(self.latencies) / 1000.0
        tps = total_tokens / total_time_s if total_time_s > 0 else 0.0

        return {
            "requests_total": len(self.latencies),
            "latency_p50_ms": p50,
            "latency_p95_ms": p95,
            "ttft_avg_ms": mean(self.ttfts),
            "tokens_per_second": tps,
            "tokens_total": total_tokens,
        }


def percentile(sorted_values: List[float], percentile_value: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * (percentile_value / 100)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    d0 = sorted_values[int(f)] * (c - k)
    d1 = sorted_values[int(c)] * (k - f)
    return d0 + d1
