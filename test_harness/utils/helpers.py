import os
import json
import asyncio
import socket
from pathlib import Path
from typing import Dict, Any

from core.utils.logger import get_logger

logger = get_logger("test.utils")

def find_free_port(start: int = 8000, end: int = 9000) -> int:
    """
    Find a free port in the given range.
    
    Args:
        start: Start of port range
        end: End of port range
        
    Returns:
        Free port number
        
    Raises:
        RuntimeError: If no free port is found
    """
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    
    raise RuntimeError(f"No free port found in range {start}-{end}")

def load_json_file(file_path: str) -> Dict[str, Any]:
    """
    Load a JSON file.
    
    Args:
        file_path: Path to the JSON file
        
    Returns:
        Parsed JSON content
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        json.JSONDecodeError: If the file contains invalid JSON
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    with open(path, 'r') as f:
        return json.load(f)

def save_json_file(file_path: str, data: Dict[str, Any]):
    """
    Save data to a JSON file.
    
    Args:
        file_path: Path to the JSON file
        data: Data to save
    """
    path = Path(file_path)
    os.makedirs(path.parent, exist_ok=True)
    
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

async def wait_for_service(host: str, port: int, timeout: int = 30) -> bool:
    """
    Wait for a service to be available.
    
    Args:
        host: Service hostname
        port: Service port
        timeout: Maximum time to wait in seconds
        
    Returns:
        True if service becomes available, False on timeout
    """
    start_time = asyncio.get_event_loop().time()
    
    while asyncio.get_event_loop().time() - start_time < timeout:
        try:
            # Try to connect to the service
            reader, writer = await asyncio.open_connection(host, port)
            writer.close()
            await writer.wait_closed()
            
            logger.info(f"Service at {host}:{port} is available")
            return True
        except (ConnectionRefusedError, OSError):
            # Wait and retry
            await asyncio.sleep(1)
    
    logger.warning(f"Timeout waiting for service at {host}:{port}")
    return False