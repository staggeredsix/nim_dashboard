from __future__ import annotations

from app.benchmark import build_parameter_grid
from app.schemas import BenchmarkParameters


def test_build_parameter_grid():
    base = BenchmarkParameters()
    grid = build_parameter_grid(
        base,
        concurrency_values=[1, 2],
        max_tokens_values=[16, 32],
        temperature_values=[0.1, 0.2],
    )

    assert len(grid) == 8
    assert all(isinstance(item, BenchmarkParameters) for item in grid)
    assert grid[0].concurrency == 1
    assert grid[-1].concurrency == 2
    assert grid[0].max_tokens == 16
    assert grid[-1].max_tokens == 32
