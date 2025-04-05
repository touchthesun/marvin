# test_harness/utils/retry.py
import asyncio
import functools
import time
import traceback
from typing import Callable, TypeVar, Any, Optional

from core.utils.logger import get_logger

logger = get_logger(__name__)

T = TypeVar('T')

def retry_async(max_attempts: int = 3, delay: float = 1.0, 
                backoff_factor: float = 2.0, exceptions: tuple = (Exception,)):
    """
    Decorator for retrying async functions with exponential backoff.
    
    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff_factor: Multiplier for delay after each retry
        exceptions: Tuple of exceptions to catch and retry
        
    Returns:
        Decorated function that will retry on specified exceptions
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Try to get a meaningful name for logging
            try:
                if args and hasattr(args[0], 'logger'):
                    local_logger = args[0].logger
                else:
                    local_logger = logger
            except Exception:
                local_logger = logger
                
            remaining_attempts = max_attempts
            current_delay = delay
            last_exception = None
            
            while remaining_attempts > 0:
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    remaining_attempts -= 1
                    last_exception = e
                    
                    if remaining_attempts <= 0:
                        local_logger.warning(
                            f"All {max_attempts} retry attempts failed for {func.__name__}. "
                            f"Last error: {str(e)}"
                        )
                        raise
                    
                    # Log retry attempt
                    local_logger.info(
                        f"Retrying {func.__name__} after error: {str(e)}. "
                        f"Attempt {max_attempts - remaining_attempts + 1}/{max_attempts} "
                        f"in {current_delay:.1f}s"
                    )
                    
                    # Wait before retrying
                    await asyncio.sleep(current_delay)
                    
                    # Increase delay for next retry
                    current_delay *= backoff_factor
            
            # This should never be reached, but just in case
            if last_exception:
                raise last_exception
                
        return wrapper
    return decorator


def retry_sync(max_attempts: int = 3, delay: float = 1.0, 
               backoff_factor: float = 2.0, exceptions: tuple = (Exception,)):
    """
    Decorator for retrying synchronous functions with exponential backoff.
    
    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff_factor: Multiplier for delay after each retry
        exceptions: Tuple of exceptions to catch and retry
        
    Returns:
        Decorated function that will retry on specified exceptions
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Try to get a meaningful name for logging
            try:
                if args and hasattr(args[0], 'logger'):
                    local_logger = args[0].logger
                else:
                    local_logger = logger
            except Exception:
                local_logger = logger
                
            remaining_attempts = max_attempts
            current_delay = delay
            last_exception = None
            
            while remaining_attempts > 0:
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    remaining_attempts -= 1
                    last_exception = e
                    
                    if remaining_attempts <= 0:
                        local_logger.warning(
                            f"All {max_attempts} retry attempts failed for {func.__name__}. "
                            f"Last error: {str(e)}"
                        )
                        raise
                    
                    # Log retry attempt
                    local_logger.info(
                        f"Retrying {func.__name__} after error: {str(e)}. "
                        f"Attempt {max_attempts - remaining_attempts + 1}/{max_attempts} "
                        f"in {current_delay:.1f}s"
                    )
                    
                    # Wait before retrying
                    time.sleep(current_delay)
                    
                    # Increase delay for next retry
                    current_delay *= backoff_factor
            
            # This should never be reached, but just in case
            if last_exception:
                raise last_exception
                
        return wrapper
    return decorator


async def with_timeout(coro, timeout: float, description: str = None, 
                       fallback: Optional[Any] = None, logger_instance = None):
    """
    Helper function to execute a coroutine with timeout and fallback.
    
    Args:
        coro: Coroutine to execute
        timeout: Timeout in seconds
        description: Description for logging (defaults to "operation")
        fallback: Value to return if timeout occurs
        logger_instance: Logger instance to use (defaults to module logger)
        
    Returns:
        Result of coroutine or fallback value on timeout
    """
    local_logger = logger_instance or logger
    operation_name = description or "operation"
    
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        local_logger.warning(f"Timeout ({timeout}s) executing {operation_name}")
        return fallback
    except Exception as e:
        local_logger.error(f"Error executing {operation_name}: {str(e)}")
        local_logger.debug(traceback.format_exc())
        return fallback