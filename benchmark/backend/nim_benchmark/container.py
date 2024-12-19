"""Container management for NIM benchmarks."""
import subprocess
import logging
import time
import socket
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ContainerInfo:
    """Container information and status."""
    container_id: str
    port: int
    url: str
    process: Optional[subprocess.Popen] = None

class ContainerManager:
    """Manages Docker container lifecycle."""
    
    def __init__(self, base_port: int = 8000):
        self.base_port = base_port
        self._active_containers = {}

    def is_port_available(self, port: int) -> bool:
        """Check if a port is available."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('127.0.0.1', port)) != 0

    def find_available_port(self) -> int:
        """Find next available port starting from base_port."""
        port = self.base_port
        while not self.is_port_available(port):
            port += 1
        return port

    def stop_all_containers(self) -> None:
        """Stop and remove all Docker containers."""
        try:
            subprocess.run("docker stop $(docker ps -q)", shell=True, check=False)
            subprocess.run("docker rm $(docker ps -a -q)", shell=True, check=False)
            subprocess.run("docker container prune -f", shell=True, check=False)
            self._active_containers.clear()
        except Exception as e:
            logger.error(f"Error stopping containers: {e}")

    async def start_container(
        self,
        image_name: str,
        ngc_api_key: str,
        gpu_indices: str = "all",
        cache_dir: str = "~/.cache/nim"
    ) -> ContainerInfo:
        """Start a Docker container for NIM benchmarking."""
        try:
            port = self.find_available_port()
            
            # Prepare GPU flags
            gpu_flag = "--gpus=all" if gpu_indices.lower() == "all" else f'--gpus="device={gpu_indices}"'
            
            # Construct Docker run command
            cmd = [
                "docker", "run", "-d",
                "--rm",
                gpu_flag,
                "--shm-size=16GB",
                f"-e NGC_API_KEY={ngc_api_key}",
                f"-v {cache_dir}:/opt/nim/.cache",
                f"-p {port}:8000",
                image_name
            ]
            
            # Start container
            result = subprocess.run(
                " ".join(cmd),
                shell=True,
                capture_output=True,
                text=True,
                check=True
            )
            
            container_id = result.stdout.strip()
            
            # Wait for container to be ready
            await self.wait_for_container(container_id)
            
            container = ContainerInfo(
                container_id=container_id,
                port=port,
                url=f"http://localhost:{port}"
            )
            
            self._active_containers[container_id] = container
            return container
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Error starting container: {e.stderr}")
            raise RuntimeError(f"Failed to start container: {e.stderr}")
            
        except Exception as e:
            logger.error(f"Unexpected error starting container: {e}")
            raise

    async def wait_for_container(self, container_id: str, timeout: int = 60) -> None:
        """Wait for container to be ready."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                result = subprocess.run(
                    f"docker logs {container_id}",
                    shell=True,
                    capture_output=True,
                    text=True
                )
                if "Uvicorn running on" in result.stdout:
                    logger.info("Container is ready")
                    return
                await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Error checking container logs: {e}")
                
        raise TimeoutError("Container failed to become ready")

    async def stop_container(self, container_id: str) -> None:
        """Stop a specific container."""
        try:
            subprocess.run(f"docker stop {container_id}", shell=True, check=True)
            if container_id in self._active_containers:
                del self._active_containers[container_id]
        except subprocess.CalledProcessError as e:
            logger.error(f"Error stopping container {container_id}: {e}")
            raise
