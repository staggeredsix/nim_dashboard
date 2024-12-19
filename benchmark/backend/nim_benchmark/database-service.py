"""Database service for storing benchmark results."""
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
import logging

from .models.db_models import Base, BenchmarkRun, MetricPoint

logger = logging.getLogger(__name__)

class DatabaseService:
    """Service for managing benchmark results storage."""

    def __init__(self, db_url: str = "sqlite:///benchmarks.db"):
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def create_benchmark_run(
        self,
        model_name: str,
        config: Dict[str, Any]
    ) -> BenchmarkRun:
        """Create a new benchmark run record."""
        with self.SessionLocal() as session:
            run = BenchmarkRun(
                model_name=model_name,
                config=json.dumps(config),
                status="starting",
                start_time=datetime.utcnow()
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            return run

    def update_metrics(self, run_id: int, metrics: Dict[str, Any]) -> None:
        """Add new metrics point to a benchmark run."""
        with self.SessionLocal() as session:
            point = MetricPoint(
                benchmark_run_id=run_id,
                timestamp=datetime.utcnow(),
                tokens_per_second=metrics.get("tokens_per_second", 0),
                requests_per_second=metrics.get("requests_per_second", 0),
                latency=metrics.get("current_latency", 0),
                gpu_utilization=metrics.get("gpu_utilization", 0),
                gpu_memory=metrics.get("gpu_memory", 0),
                gpu_temperature=metrics.get("gpu_temperature", 0)
            )
            session.add(point)
            session.commit()

    def update_benchmark_status(
        self,
        run_id: int,
        status: str,
        metrics: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update benchmark run status and final metrics."""
        with self.SessionLocal() as session:
            run = session.query(BenchmarkRun).get(run_id)
            if not run:
                return

            run.status = status
            if status in ["completed", "failed"]:
                run.end_time = datetime.utcnow()

            if metrics:
                run.total_requests = metrics.get("total_requests")
                run.successful_requests = metrics.get("successful_requests")
                run.total_tokens = metrics.get("total_tokens")
                run.average_tps = metrics.get("tokens_per_second")
                run.peak_tps = metrics.get("peak_tps")
                run.p95_latency = metrics.get("p95_latency")

            session.commit()

    def get_benchmark_run(self, run_id: int) -> Optional[Dict[str, Any]]:
        """Get benchmark run details."""
        with self.SessionLocal() as session:
            run = session.query(BenchmarkRun).get(run_id)
            if not run:
                return None

            return {
                "id": run.id,
                "model_name": run.model_name,
                "status": run.status,
                "start_time": run.start_time.isoformat(),
                "end_time": run.end_time.isoformat() if run.end_time else None,
                "config": json.loads(run.config),
                "metrics": {
                    "total_requests": run.total_requests,
                    "successful_requests": run.successful_requests,
                    "total_tokens": run.total_tokens,
                    "average_tps": run.average_tps,
                    "peak_tps": run.peak_tps,
                    "p95_latency": run.p95_latency
                }
            }

    def get_benchmark_history(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get paginated benchmark history."""
        with self.SessionLocal() as session:
            runs = (
                session.query(BenchmarkRun)
                .order_by(desc(BenchmarkRun.start_time))
                .offset(offset)
                .limit(limit)
                .all()
            )
            
            return [
                {
                    "id": run.id,
                    "model_name": run.model_name,
                    "status": run.status,
                    "start_time": run.start_time.isoformat(),
                    "end_time": run.end_time.isoformat() if run.end_time else None,
                    "metrics": {
                        "total_requests": run.total_requests,
                        "successful_requests": run.successful_requests,
                        "average_tps": run.average_tps,
                        "p95_latency": run.p95_latency
                    }
                }
                for run in runs
            ]