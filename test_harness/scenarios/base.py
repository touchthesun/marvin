from abc import ABC, abstractmethod
from typing import Dict, Any

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
    
    @abstractmethod
    async def setup(self):
        """Set up the scenario prerequisites."""
        pass
    
    @abstractmethod
    async def execute(self):
        """
        Execute the test scenario.
        
        Returns:
            Any: Scenario execution results
        """
        pass
    
    @abstractmethod
    async def validate(self, results):
        """
        Validate the scenario results.
        
        Args:
            results: Results from execute()
            
        Returns:
            List[Assertion]: List of test assertions
        """
        pass
    
    async def teardown(self):
        """Clean up scenario resources."""
        for resource in reversed(self.resources):
            try:
                await resource.cleanup()
            except Exception as e:
                self.logger.warning(f"Error cleaning up resource: {str(e)}")
    
    def register_resource(self, resource):
        """
        Register a resource for cleanup during teardown.
        
        Args:
            resource: Resource with a cleanup() method
        """
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
        log_method = self.logger.info if condition else self.logger.error
        log_method(f"Assertion '{name}': {'PASS' if condition else 'FAIL'} - {description}")
        
        return assertion
    
    async def timed_operation(self, name: str, coroutine):
        """
        Execute and time an async operation.
        
        Args:
            name: Operation name for timing
            coroutine: Coroutine to execute
            
        Returns:
            Operation result
        """
        if self.performance_monitor:
            self.performance_monitor.start_timer(name)
            
        try:
            result = await coroutine
            return result
        finally:
            if self.performance_monitor:
                self.performance_monitor.end_timer(name)