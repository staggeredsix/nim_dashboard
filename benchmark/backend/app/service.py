"""Service layer orchestrating benchmark runs and persistence."""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from sqlalchemy import func, select

from .benchmark import BenchmarkExecutor, run_auto_benchmark
from .database import get_session
from .models import BenchmarkRun
from .schemas import AutoBenchmarkRequest, BenchmarkHistoryItem, BenchmarkRequest, BenchmarkResult
from .utils import model_dump


class BenchmarkService:
    def __init__(self) -> None:
        self._tasks: Dict[int, asyncio.Task[BenchmarkResult]] = {}
        self._lock = asyncio.Lock()

    async def create_run(self, request: BenchmarkRequest) -> BenchmarkRun:
        async with self._lock:
            with get_session() as session:
                run = BenchmarkRun.from_request(
                    provider=request.provider,
                    model_name=request.model_name,
                    prompt=request.prompt,
                    parameters={
                        "base_url": str(request.base_url) if request.base_url else None,
                        "parameters": model_dump(request.parameters),
                        "backend_parameters": model_dump(request.backend_parameters),
                        "prompt_settings": {
                            "use_random_prompts": request.use_random_prompts,
                            "random_prompt_count": request.random_prompt_count,
                        },
                        "metadata": request.metadata,
                    },
                )
                session.add(run)
                session.flush()
                session.refresh(run)
                return run

    async def run_benchmark(self, run_id: int, request: BenchmarkRequest) -> None:
        executor = BenchmarkExecutor(request)
        try:
            with get_session() as session:
                run = session.get(BenchmarkRun, run_id)
                if not run:
                    return
                run.mark_started()
                session.add(run)

            result = await executor.run(run_id=run_id)

            with get_session() as session:
                run = session.get(BenchmarkRun, run_id)
                if not run:
                    return
                run.mark_completed(result.metrics)
                session.add(run)
        except Exception as exc:  # noqa: BLE001
            with get_session() as session:
                run = session.get(BenchmarkRun, run_id)
                if run:
                    run.mark_failed(str(exc))
                    session.add(run)
            raise

    async def schedule_run(self, request: BenchmarkRequest) -> BenchmarkRun:
        run = await self.create_run(request)
        task = asyncio.create_task(self.run_benchmark(run.id, request))
        async with self._lock:
            self._tasks[run.id] = task
        task.add_done_callback(lambda t, run_id=run.id: self._tasks.pop(run_id, None))
        return run

    async def run_auto(self, request: AutoBenchmarkRequest) -> List[BenchmarkResult]:
        return await run_auto_benchmark(request)

    async def get_run(self, run_id: int) -> Optional[BenchmarkHistoryItem]:
        with get_session() as session:
            run = session.get(BenchmarkRun, run_id)
            if not run:
                return None
            data = run.to_dict()
            return BenchmarkHistoryItem(
                id=data["id"],
                provider=run.provider,
                model_name=data["model_name"],
                status=data["status"],
                created_at=data["created_at"],
                completed_at=data["completed_at"],
                metrics=data["metrics"],
                error=data["error"],
                parameters=data.get("parameters"),
            )

    async def list_runs(self, limit: int = 20, offset: int = 0) -> List[BenchmarkHistoryItem]:
        with get_session() as session:
            statement = (
                select(BenchmarkRun)
                .order_by(BenchmarkRun.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
            runs = session.execute(statement).scalars().all()
            return [
                BenchmarkHistoryItem(
                    id=run.id,
                    provider=run.provider,
                    model_name=run.model_name,
                    status=run.status,
                    created_at=run.created_at.isoformat(),
                    completed_at=run.completed_at.isoformat() if run.completed_at else None,
                    metrics=run.metrics,
                    error=run.error,
                    parameters=run.parameters,
                )
                for run in runs
            ]

    async def count_runs(self) -> int:
        with get_session() as session:
            return session.execute(select(func.count(BenchmarkRun.id))).scalar_one()
