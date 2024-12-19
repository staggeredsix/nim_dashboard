"""Benchmark execution and metrics collection."""
import asyncio
import logging
import time
from typing import Dict, Optional, AsyncGenerator
import aiohttp
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class BenchmarkConfig:
    """Benchmark configuration."""
    total_requests: int
    concurrency_level: int
    max_tokens: int = 100
    timeout: int = 30
    prompt: str = "Explain quantum computing briefly"

class BenchmarkExecutor:
    """Executes benchmark requests and collects metrics."""
    
    def __init__(
        self,
        url: str,
        model_name: str,
        config: BenchmarkConfig,
        ngc_api_key: str
    ):
        self.url = url
        self.model_name = model_name
        self.config = config
        self.ngc_api_key = ngc_api_key
        self.metrics = []
        self._start_time = None
        self._is_running = False

    async def _make_request(
        self,
        session: aiohttp.ClientSession,
        request_id: int
    ) -> Dict:
        """Execute a single benchmark request."""
        start_time = time.time()
        tokens = 0
        first_token_time = None
        success = False
        error = None

        try:
            async with session.post(
                f"{self.url}/v1/completions",
                json={
                    "model": self.model_name,
                    "prompt": self.config.prompt,
                    "max_tokens": self.config.max_tokens,
                    "stream": True
                },
                headers={"Authorization": f"Bearer {self.ngc_api_key}"},
                timeout=self.config.timeout
            ) as response:
                response.raise_for_status()
                
                async for chunk in response.content:
                    if not first_token_time:
                        first_token_time = time.time()
                    tokens += 1
                
                success = True

        except Exception as e:
            error = str(e)
            logger.error(f"Request {request_id} failed: {e}")

        end_time = time.time()
        
        return {
            "request_id": request_id,
            "duration": end_time - start_time,
            "tokens": tokens,
            "time_to_first_token": first_token_time - start_time if first_token_time else None,
            "success": success,
            "error": error
        }

    async def _execute_requests(self) -> AsyncGenerator[Dict, None]:
        """Execute benchmark requests with concurrency control."""
        semaphore = asyncio.Semaphore(self.config.concurrency_level)
        completed_requests = 0
        successful_requests = 0
        total_tokens = 0
        
        async def worker(request_id: int):
            async with semaphore:
                async with aiohttp.ClientSession() as session:
                    result = await self._make_request(session, request_id)
                    nonlocal completed_requests, successful_requests, total_tokens
                    completed_requests += 1
                    if result["success"]:
                        successful_requests += 1
                        total_tokens += result["tokens"]
                    self.metrics.append(result)
                    
                    # Calculate current metrics
                    duration = time.time() - self._start_time
                    return {
                        "completed_requests": completed_requests,
                        "successful_requests": successful_requests,
                        "total_tokens": total_tokens,
                        "tokens_per_second": total_tokens / duration,
                        "requests_per_second": completed_requests / duration,
                        "current_latency": result["duration"],
                        "time_to_first_token": result["time_to_first_token"]
                    }

        self._start_time = time.time()
        self._is_running = True
        tasks = []

        try:
            for i in range(self.config.total_requests):
                if not self._is_running:
                    break
                    
                task = asyncio.create_task(worker(i))
                tasks.append(task)
                
                # Yield metrics update after each request
                if len(tasks) >= self.config.concurrency_level:
                    done, tasks = await asyncio.wait(
                        tasks, 
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    for t in done:
                        yield await t

            # Wait for remaining tasks
            if tasks:
                done, _ = await asyncio.wait(tasks)
                for t in done:
                    yield await t

        except Exception as e:
            logger.error(f"Error during benchmark execution: {e}")
            self._is_running = False
            raise

    def stop(self):
        """Stop the benchmark execution."""
        self._is_running = False

    async def run(self) -> AsyncGenerator[Dict, None]:
        """Run the benchmark and yield metrics updates."""
        try:
            async for metrics in self._execute_requests():
                yield metrics
        except Exception as e:
            logger.error(f"Benchmark failed: {e}")
            raise
        finally:
            self._is_running = False

    def get_final_metrics(self) -> Dict:
        """Calculate final benchmark metrics."""
        if not self.metrics:
            return {}
            
        successful = [m for m in self.metrics if m["success"]]
        if not successful:
            return {"error": "No successful requests"}
            
        durations = [m["duration"] for m in successful]
        ttfts = [m["time_to_first_token"] for m in successful if m["time_to_first_token"]]
        
        durations.sort()
        ttfts.sort()
        
        total_duration = time.time() - self._start_time
        total_tokens = sum(m["tokens"] for m in successful)
        
        return {
            "total_requests": len(self.metrics),
            "successful_requests": len(successful),
            "total_tokens": total_tokens,
            "tokens_per_second": total_tokens / total_duration,
            "average_latency": sum(durations) / len(durations),
            "p95_latency": durations[int(len(durations) * 0.95)],
            "p99_latency": durations[int(len(durations) * 0.99)],
            "average_ttft": sum(ttfts) / len(ttfts) if ttfts else None,
            "duration": total_duration
        }