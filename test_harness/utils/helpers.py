import os
import json
import time
import asyncio
import socket
import traceback
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
    logger.debug(f"Looking for free port in range {start}-{end}")
    
    for port in range(start, end):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('localhost', port)) != 0:
                    logger.debug(f"Found free port: {port}")
                    return port
        except Exception as e:
            logger.warning(f"Error checking port {port}: {str(e)}")
    
    logger.error(f"No free port found in range {start}-{end}")
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
    logger.debug(f"Loading JSON from file: {file_path}")
    
    path = Path(file_path)
    if not path.exists():
        logger.error(f"File not found: {file_path}")
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        
        logger.debug(f"Successfully loaded JSON from {file_path}")
        return data
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in file {file_path}: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error loading JSON from {file_path}: {str(e)}")
        logger.error(traceback.format_exc())
        raise

def save_json_file(file_path: str, data: Dict[str, Any]):
    """
    Save data to a JSON file.
    
    Args:
        file_path: Path to the JSON file
        data: Data to save
    """
    logger.debug(f"Saving JSON to file: {file_path}")
    
    path = Path(file_path)
    try:
        os.makedirs(path.parent, exist_ok=True)
        
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.debug(f"Successfully saved JSON to {file_path}")
    except Exception as e:
        logger.error(f"Error saving JSON to {file_path}: {str(e)}")
        logger.error(traceback.format_exc())
        raise

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
    logger.debug(f"Waiting for service at {host}:{port} (timeout: {timeout}s)")
    
    start_time = asyncio.get_event_loop().time()
    attempt = 0
    
    while asyncio.get_event_loop().time() - start_time < timeout:
        attempt += 1
        try:
            # Try to connect to the service
            logger.debug(f"Connection attempt {attempt} to {host}:{port}")
            reader, writer = await asyncio.open_connection(host, port)
            writer.close()
            await writer.wait_closed()
            
            elapsed = asyncio.get_event_loop().time() - start_time
            logger.info(f"Service at {host}:{port} is available (took {elapsed:.2f}s)")
            return True
        except (ConnectionRefusedError, OSError) as e:
            # Wait and retry
            logger.debug(f"Connection attempt {attempt} failed: {str(e)}")
            await asyncio.sleep(1)
    
    elapsed = asyncio.get_event_loop().time() - start_time
    logger.warning(f"Timeout waiting for service at {host}:{port} after {elapsed:.2f}s")
    return False


async def wait_for_task_completion(api_service, task_id, auth_token, max_wait=60, initial_interval=1):
    """
    Wait for a task to complete with improved error handling and backoff.
    
    Args:
        api_service: API service to use for requests
        task_id: Task ID to check
        auth_token: Authentication token
        max_wait: Maximum wait time in seconds
        initial_interval: Initial polling interval in seconds
        
    Returns:
        Final task status response
    """
    logger = get_logger("test.utils")
    logger.info(f"Waiting for task {task_id} to complete (timeout: {max_wait}s)")
    
    start_time = time.time()
    last_status = None
    interval = initial_interval
    not_found_count = 0
    connection_error_count = 0
    
    while time.time() - start_time < max_wait:
        try:
            # Check task status using the correct API path
            status_response = await api_service.send_request(
                "GET",
                f"/api/v1/analysis/status/{task_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            # Reset connection error count on successful request
            connection_error_count = 0
            
            last_status = status_response
            
            if not status_response.get("success", False):
                # Check if this is a task not found error
                data = status_response.get("data", {})
                error_message = data.get("message", "")
                
                if "not found" in error_message.lower():
                    not_found_count += 1
                    if not_found_count >= 3:
                        logger.error(f"Task {task_id} consistently not found after {not_found_count} attempts")
                        return status_response
                else:
                    not_found_count = 0
                
                logger.warning(f"Error checking task status: {status_response}")
                await asyncio.sleep(interval)
                
                # Increase interval with a cap
                interval = min(interval * 1.5, 10)
                continue
            
            # Reset not found counter on success
            not_found_count = 0
            
            # Get status from response
            data = status_response.get("data", {})
            status = data.get("status")
            
            if status in ["completed", "error"]:
                logger.info(f"Task {task_id} finished with status: {status}")
                return status_response
            
            progress = data.get("progress", 0)
            logger.debug(f"Task {task_id} in progress: {progress:.1%}")
            
            # Use progressive backoff for polling
            await asyncio.sleep(interval)
            interval = min(interval * 1.2, 10)  # More gradual backoff
            
        except Exception as e:
            connection_error_count += 1
            logger.warning(f"Connection error checking task status (attempt {connection_error_count}): {str(e)}")
            
            # If we've had multiple consecutive connection errors, 
            # return a special response
            if connection_error_count >= 3:
                logger.error(f"Too many consecutive connection errors ({connection_error_count}), assuming API is unavailable")
                return {
                    "success": False,
                    "error": {
                        "error_code": "CONNECTION_ERROR",
                        "message": f"API connection error: {str(e)}"
                    }
                }
                
            # Use shorter interval for connection errors
            await asyncio.sleep(min(interval, 2))
    
    logger.warning(f"Timeout waiting for task {task_id} to complete after {max_wait}s")
    return last_status or {
        "success": False,
        "error": {
            "error_code": "TIMEOUT",
            "message": f"Task {task_id} did not complete within {max_wait} seconds"
        }
    }