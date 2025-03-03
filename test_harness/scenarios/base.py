import asyncio
import traceback
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Callable, Awaitable
from contextlib import contextmanager
from time import time

from core.utils.logger import get_logger
from test_harness.assertions import Assertion

class TestScenario(ABC):
    """
    Base class for all test scenarios.
    """
    
    def __init__(self, components: Dict[str, Any], test_data: Dict[str, Any], 
                 config: Dict[str, Any], performance_monitor=None):
        """
        Initialize the test scenario.
        
        Args:
            components: Dictionary of test services
            test_data: Test data for the scenario
            config: Test configuration
            performance_monitor: Optional performance monitor
        """
        self.components = components
        self.test_data = test_data
        self.config = config
        self.performance_monitor = performance_monitor
        
        # Set up logging
        self.logger = get_logger(f"test.scenarios.{self.__class__.__name__}", 
                                config.get("log_level"))
        
        # Resources to clean up
        self.resources = []
        
        self.logger.info(f"Initialized {self.__class__.__name__} scenario")
        self.logger.debug(f"Available components: {', '.join(self.components.keys())}")
        self.logger.debug(f"Test data keys: {', '.join(self.test_data.keys()) if self.test_data else 'none'}")
    
    @abstractmethod
    async def setup(self):
        """Set up the scenario prerequisites."""
        self.logger.info("Setting up scenario")
    
    @abstractmethod
    async def execute(self):
        """
        Execute the test scenario.
        
        Returns:
            Any: Scenario execution results
        """
        self.logger.info("Executing scenario")
    
    @abstractmethod
    async def validate(self, results):
        """
        Validate the scenario results.
        
        Args:
            results: Results from execute()
            
        Returns:
            List[Assertion]: List of test assertions
        """
        self.logger.info("Validating scenario results")
    
    async def teardown(self):
        """Clean up scenario resources."""
        self.logger.info(f"Cleaning up {len(self.resources)} resources")
        
        for i, resource in enumerate(reversed(self.resources)):
            try:
                self.logger.debug(f"Cleaning up resource {i+1}/{len(self.resources)}: {resource.__class__.__name__}")
                await resource.cleanup()
                self.logger.debug(f"Resource {i+1}/{len(self.resources)} cleanup completed")
            except Exception as e:
                self.logger.warning(f"Error cleaning up resource {resource.__class__.__name__}: {str(e)}")
                self.logger.warning(traceback.format_exc())
    
    def register_resource(self, resource):
        """
        Register a resource for cleanup during teardown.
        
        Args:
            resource: Resource with a cleanup() method
        """
        self.logger.debug(f"Registering resource for cleanup: {resource.__class__.__name__}")
        self.resources.append(resource)
    
    def create_assertion(self, name: str, condition: bool, description: str) -> Assertion:
        """
        Create a test assertion.
        
        Args:
            name: Assertion name
            condition: Boolean condition (True for pass, False for fail)
            description: Human-readable description
            
        Returns:
            Assertion object
        """
        assertion = Assertion(name, condition, description)
        
        # Log the assertion
        log_method = self.logger.info if condition else self.logger.warning
        status = "PASS" if condition else "FAIL"
        log_method(f"Assertion '{name}': {status} - {description}")
        
        return assertion
    
    @contextmanager
    def timed_operation(self, name: str):
        """
        Context manager for timing an operation.
        
        Args:
            name: Operation name for timing
        """
        self.logger.debug(f"Starting timed operation: {name}")
        start = time()
        
        if self.performance_monitor:
            self.performance_monitor.start_timer(name)
        
        try:
            yield
        except Exception as e:
            self.logger.error(f"Error in timed operation {name}: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
        finally:
            duration = time() - start
            self.logger.debug(f"Completed timed operation: {name} in {duration:.3f}s")
            
            if self.performance_monitor:
                self.performance_monitor.end_timer(name)
    
    async def perform_with_retry(self, operation: Callable[[], Awaitable], 
                               retries: int = 3, delay: float = 1.0, 
                               description: str = "operation"):
        """
        Perform an operation with retries on failure.
        
        Args:
            operation: Async function to perform
            retries: Maximum number of retries
            delay: Delay between retries in seconds
            description: Description of the operation for logging
            
        Returns:
            Operation result
            
        Raises:
            Exception: If all retries fail
        """
        self.logger.debug(f"Attempting {description} with {retries} retries")
        
        attempt = 0
        last_error = None
        
        while attempt <= retries:
            attempt += 1
            try:
                self.logger.debug(f"{description} attempt {attempt}/{retries+1}")
                result = await operation()
                self.logger.debug(f"{description} succeeded on attempt {attempt}")
                return result
            except Exception as e:
                last_error = e
                if attempt <= retries:
                    self.logger.warning(f"{description} attempt {attempt} failed: {str(e)}")
                    await asyncio.sleep(delay)
                else:
                    self.logger.error(f"All attempts for {description} failed: {str(e)}")
        
        # If we get here, all retries failed
        raise last_error