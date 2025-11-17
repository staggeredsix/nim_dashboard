"""Static workflow descriptions for backend orchestration."""
from __future__ import annotations

from typing import Dict, List

from fastapi import HTTPException

from .schemas import (
    ApiSimulation,
    BackendWorkflowDefinition,
    BenchmarkProvider,
    QuantizationStrategy,
    WorkflowSimulationRequest,
    WorkflowSimulationResponse,
    WorkflowSimulationStep,
    WorkflowStage,
    WorkflowStep,
)


WORKFLOWS: Dict[BenchmarkProvider, BackendWorkflowDefinition] = {
    BenchmarkProvider.NIM: BackendWorkflowDefinition(
        provider=BenchmarkProvider.NIM,
        name="NVIDIA NIM",
        description="Containerized deployment with Docker and NGC credentials.",
        download=[
            WorkflowStep(
                label="Select API key profile",
                detail="Choose the saved NGC profile to authenticate against nvcr.io.",
            ),
            WorkflowStep(
                label="docker login",
                detail="Authenticate via the profile token to access private registries.",
                command="echo $NGC_KEY | docker login nvcr.io -u $oauthtoken --password-stdin",
            ),
            WorkflowStep(
                label="docker pull",
                detail="Download the desired NIM container image.",
                command="docker pull nvcr.io/nim/nemotron-3-8b-instruct:latest",
            ),
        ],
        deploy=[
            WorkflowStep(
                label="Start container",
                detail="Launch the NIM container with appropriate GPU visibility and TLS settings.",
                command="docker run --gpus=all -p 8001:8001 nvcr.io/nim/nemotron-3-8b-instruct:latest",
            ),
            WorkflowStep(
                label="Configure base URL",
                detail="Expose the service through the dashboard with the correct host mapping.",
            ),
        ],
        optimize=[
            WorkflowStep(
                label="Enable NVFP4",
                detail="Use unsloth to emit NVFP4 kernels compatible with TensorRT-LLM.",
                command="python -m unsloth.quantize --format nvfp4 --input model.safetensors",
            ),
            WorkflowStep(
                label="Export FP8",
                detail="Fallback to FP8 TensorRT checkpoints for Hopper deployments.",
                command="python -m unsloth.quantize --format fp8 --input model.safetensors",
            ),
        ],
        test=[
            WorkflowStep(
                label="/v1/completions smoke test",
                detail="POST to the NIM endpoint with a small prompt to verify readiness.",
                command="""curl -X POST $NIM_HOST/v1/completions -d '{"prompt":"ping"}'""",
            ),
            WorkflowStep(
                label="Accuracy harness",
                detail="Invoke the dashboard's accuracy + agentic toggles to capture signals.",
            ),
        ],
        quantization_strategies=[
            QuantizationStrategy(
                name="NVFP4",
                description="Ultra-low precision for NVIDIA GPUs via unsloth kernels.",
                command="python -m unsloth.quantize --format nvfp4",
            ),
            QuantizationStrategy(
                name="FP4",
                description="Generic FP4 weights for experimental research workflows.",
                command="python -m unsloth.quantize --format fp4",
            ),
            QuantizationStrategy(
                name="FP8",
                description="Balanced FP8 export for Hopper and Blackwell accelerators.",
                command="python -m unsloth.quantize --format fp8",
            ),
        ],
        api_simulation=ApiSimulation(
            method="POST",
            endpoint="/v1/completions",
            description="Matches the official NIM text completion surface.",
            payload={
                "model": "nemotron-3-8b-instruct",
                "prompt": "Summarize NVFP4",
                "max_tokens": 64,
            },
        ),
    ),
    BenchmarkProvider.VLLM: BackendWorkflowDefinition(
        provider=BenchmarkProvider.VLLM,
        name="vLLM",
        description="Open inference server powered by vLLM.",
        download=[
            WorkflowStep(
                label="Download HF weights",
                detail="Use the built-in downloader to snapshot Meta-Llama checkpoints.",
                command="huggingface-cli download meta-llama/Meta-Llama-3-8B",
            ),
            WorkflowStep(
                label="Materialize tokenizer",
                detail="Copy tokenizer.json into the vLLM model directory.",
            ),
        ],
        deploy=[
            WorkflowStep(
                label="Launch vLLM",
                detail="Start the Python server with tensor parallel and gpu memory flags.",
                command="python -m vllm.entrypoints.openai.api_server --model ./models/llama3",
            ),
            WorkflowStep(
                label="Expose OpenAI compatible API",
                detail="Confirm /v1/completions and /v1/chat/completions return metadata.",
            ),
        ],
        optimize=[
            WorkflowStep(
                label="unsloth nvfp4",
                detail="Apply NVFP4 or FP4 quantization using unsloth exporters.",
                command="python -m unsloth.quantize --format nvfp4 --model ./models/llama3",
            ),
            WorkflowStep(
                label="Tensor parallel plan",
                detail="Tune vLLM parallelism for throughput vs. latency trade-offs.",
            ),
        ],
        test=[
            WorkflowStep(
                label="/v1/completions smoke test",
                detail="Issue a POST to ensure tokens stream back with metrics.",
                command="""curl -X POST $VLLM_HOST/v1/completions -d '{"prompt":"ping"}'""",
            ),
            WorkflowStep(
                label="Agentic evaluation",
                detail="Enable agentic scoring in the dashboard to verify reasoning steps.",
            ),
        ],
        quantization_strategies=[
            QuantizationStrategy(
                name="NVFP4 via unsloth",
                description="Generates TensorRT-ready weights for Hopper GPUs.",
                command="python -m unsloth.quantize --format nvfp4",
            ),
            QuantizationStrategy(
                name="FP4",
                description="Heaviest compression with the lowest memory footprint.",
                command="python -m unsloth.quantize --format fp4",
            ),
            QuantizationStrategy(
                name="FP8",
                description="Balanced quality/performance trade-off for vLLM.",
                command="python -m unsloth.quantize --format fp8",
            ),
        ],
        api_simulation=ApiSimulation(
            method="POST",
            endpoint="/v1/completions",
            description="OpenAI-compatible interface offered by vLLM.",
            payload={
                "model": "Meta-Llama-3-8B-Instruct",
                "prompt": "Plan an agentic workflow",
                "temperature": 0.2,
            },
        ),
    ),
    BenchmarkProvider.LLAMACPP: BackendWorkflowDefinition(
        provider=BenchmarkProvider.LLAMACPP,
        name="llama.cpp",
        description="Portable CPU/GPU inference server.",
        download=[
            WorkflowStep(
                label="Convert GGUF",
                detail="Use convert-llama-weights to produce GGUF artifacts.",
                command="python convert.py --to gguf --model llama3",
            ),
            WorkflowStep(
                label="Stage model",
                detail="Copy GGUF and tokenizer into the llama.cpp models directory.",
            ),
        ],
        deploy=[
            WorkflowStep(
                label="Start server",
                detail="Run server.cpp with the desired context window and gpu-layers.",
                command="./server -m ./models/llama3.gguf --port 8080",
            ),
            WorkflowStep(
                label="Secure endpoints",
                detail="Optionally configure HTTP auth tokens before exposing to users.",
            ),
        ],
        optimize=[
            WorkflowStep(
                label="Quantize to Q4_K",
                detail="Use llama.cpp quantize utility for FP4 style formats.",
                command="./quantize models/llama3.gguf models/llama3.q4_k.gguf q4_k",
            ),
            WorkflowStep(
                label="Experiment with FP8",
                detail="Combine unsloth conversions with llama.cpp quantizers.",
            ),
        ],
        test=[
            WorkflowStep(
                label="/v1/chat/completions",
                detail="Hit the OpenAI compatible route for regression tests.",
                command="""curl -X POST $LLAMA_HOST/v1/chat/completions -d '{"messages":[{"role":"user","content":"ping"}]}'""",
            ),
            WorkflowStep(
                label="Accuracy harness",
                detail="Toggle accuracy/agentic evaluations to capture metrics.",
            ),
        ],
        quantization_strategies=[
            QuantizationStrategy(
                name="FP4 (Q4_K)",
                description="Native llama.cpp quantization routine for low memory.",
                command="./quantize model.gguf model.q4_k.gguf q4_k",
            ),
            QuantizationStrategy(
                name="FP8",
                description="Use unsloth to emit FP8 tensors prior to GGUF conversion.",
                command="python -m unsloth.quantize --format fp8",
            ),
        ],
        api_simulation=ApiSimulation(
            method="POST",
            endpoint="/v1/chat/completions",
            description="Matches llama.cpp's OpenAI-compatible chat surface.",
            payload={
                "model": "llama-2-7b",
                "messages": [{"role": "user", "content": "ping"}],
            },
        ),
    ),
}


class WorkflowCatalog:
    """Expose workflow metadata and simulate orchestration steps."""

    def list_workflows(self) -> List[BackendWorkflowDefinition]:
        return list(WORKFLOWS.values())

    def simulate(self, request: WorkflowSimulationRequest) -> WorkflowSimulationResponse:
        workflow = WORKFLOWS.get(request.provider)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found for provider")

        stage_steps_map = {
            WorkflowStage.DOWNLOAD: workflow.download,
            WorkflowStage.DEPLOY: workflow.deploy,
            WorkflowStage.OPTIMIZE: workflow.optimize,
            WorkflowStage.TEST: workflow.test,
        }
        steps = stage_steps_map.get(request.stage)
        if steps is None:
            raise HTTPException(status_code=400, detail="Unsupported workflow stage")

        simulated_steps = [
            WorkflowSimulationStep(
                label=step.label,
                detail=step.detail,
                command=step.command,
                status="ready",
            )
            for step in steps
        ]
        return WorkflowSimulationResponse(
            provider=request.provider,
            stage=request.stage,
            steps=simulated_steps,
            api_simulation=workflow.api_simulation,
        )
