from __future__ import annotations

import math

import pytest

from app.stats import StatsAccumulator, percentile
from app.clients.base import RequestMetrics


@pytest.mark.parametrize(
    "values, pct, expected",
    [
        ([1, 2, 3, 4, 5], 50, 3),
        ([10, 20, 30, 40], 25, 17.5),
        ([10, 20, 30, 40], 75, 32.5),
        ([], 50, 0.0),
    ],
)
def test_percentile(values, pct, expected):
    result = percentile(sorted(values), pct)
    assert math.isclose(result, expected, rel_tol=1e-9)


def test_stats_accumulator_summary():
    accumulator = StatsAccumulator()
    accumulator.add(RequestMetrics(latency_ms=100, ttft_ms=50, tokens_generated=40, completion="", raw_response={}))
    accumulator.add(RequestMetrics(latency_ms=200, ttft_ms=60, tokens_generated=60, completion="", raw_response={}))

    summary = accumulator.summarize()
    assert summary["requests_total"] == 2
    assert summary["tokens_total"] == 100
    assert summary["latency_p50_ms"] == 150
    assert summary["latency_p95_ms"] >= summary["latency_p50_ms"]
    assert summary["ttft_avg_ms"] == pytest.approx(55)
    assert summary["tokens_per_second"] > 0
