"""Main FastAPI application for NIM benchmarking."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
from typing import List, Dict, Any
import os

from .container import ContainerManager
from .benchmark import BenchmarkExecutor, BenchmarkConfig
from .database import DatabaseService
from .models import db_models

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NIM Benchmark API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
container_manager = ContainerManager()
db = DatabaseService()

# WebSocket connections
active_connections: List[WebSocket] = []

@app.on_event("startup")
async def startup():
    """Initialize database on startup."""
    db_models.init_db()

@app.get("/api/models")
async def list_models():
    """List available NIM models."""
    with open("nim_list.txt", "r") as f:
        models = []
        for line in f:
            if "|" in line:
                name, image = line.strip().split("|")
                models.append({"name": name, "image": image})
    return models

@app.post("/api/benchmark")
async def start_benchmark(config: BenchmarkConfig):
    """Start a new benchmark run."""
    try:
        # Create database entry
        run = db.create_benchmark_run(
            model_name=config.model_name,
            config=config.dict()
        )

        # Start container
        container = await container_manager.start_container(
            image_name=config.image_name,
            ngc_api_key=os.getenv("NGC_API_KEY"),
            gpu_indices=config.gpu_indices
        )

        # Create executor
        executor = BenchmarkExecutor(
            url=container.url,
            model_name=config.model_name,
            config=config,
            ngc_api_key=os.getenv("NGC_API_KEY")
        )

        # Run benchmark in background task
        app.background_tasks.add_task(
            run_benchmark,
            run.id,
            executor,
            container.container_id
        )

        return {"run_id": run.id}

    except Exception as e:
        logger.error(f"Error starting benchmark: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/benchmark/{run_id}")
async def get_benchmark_status(run_id: int):
    """Get benchmark run status and results."""
    run = db.get_benchmark_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    return run

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle any client messages if needed
    except WebSocketDisconnect:
        active_connections.remove(websocket)

async def broadcast_metrics(metrics: Dict[str, Any]):
    """Broadcast metrics to all connected clients."""
    for connection in active_connections:
        try:
            await connection.send_json({
                "type": "metrics_update",
                "data": metrics
            })
        except Exception as e:
            logger.error(f"Error broadcasting metrics: {e}")

async def run_benchmark(run_id: int, executor: BenchmarkExecutor, container_id: str):
    """Run benchmark and handle updates."""
    try:
        async for metrics in executor.run():
            # Store metrics
            db.update_metrics(run_id, metrics)
            # Broadcast update
            await broadcast_metrics(metrics)

        # Store final results
        final_metrics = executor.get_final_metrics()
        db.update_benchmark_status(run_id, "completed", final_metrics)

    except Exception as e:
        logger.error(f"Error during benchmark: {e}")
        db.update_benchmark_status(run_id, "failed", {"error": str(e)})
    finally:
        # Cleanup
        await container_manager.stop_container(container_id)