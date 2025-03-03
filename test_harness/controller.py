# marvin_test_harness/controller.py
import time
import asyncio
import traceback
from typing import Dict, List, Any, Optional

from core.utils.logger import get_logger
from marvin_test_harness.config import load_test_config
from marvin_test_harness.environment import TestEnvironmentManager
from marvin_test_harness.monitoring import PerformanceMonitor
from marvin_test_harness.reporting import TestReporter
from marvin_test_harness.assertions import Assertion

class TestHarnessController:
    """
    Central controller for the test harness. Coordinates test execution,
    environment setup/teardown, and result collection.
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize the test harness controller.
        
        Args:
            config_path: Path to the test configuration file
        """
        self.config = load_test_config(config_path)
        self.logger = get_logger("test.controller", self.config.get("log_level"))
        self.results = []
        self.components = {}
        self.environment_manager = TestEnvironmentManager(self.config)
        self.performance_monitor = PerformanceMonitor(self.config)
        self.reporter = TestReporter(self.config)
        
        self.logger.info("Test harness controller initialized")
    
    async def initialize(self):
        """
        Set up all test components based on configuration.
        
        Returns:
            The controller instance for method chaining
        """
        self.logger.info("Initializing test harness environment")
        
        # Start performance monitoring
        self.performance_monitor.start()
        
        # Initialize environment
        environment = await self.environment_manager.setup_environment()
        
        # Store component references
        self.components = {
            "neo4j": environment.get("neo4j"),
            "api": environment.get("api_server"),
            "browser": environment.get("browser_simulator"),
            "llm": environment.get("llm_mock")
        }
        
        self.logger.info("Test harness initialized successfully")
        return self
    
    async def run_scenario(self, scenario_name: str):
        """
        Run a specific test scenario.
        
        Args:
            scenario_name: Name of the scenario to run
            
        Returns:
            Dictionary containing the test results
        """
        self.logger.info(f"Running scenario: {scenario_name}")
        
        # Get the scenario class
        scenario_class = self._get_scenario_class(scenario_name)
        if not scenario_class:
            self.logger.error(f"Scenario {scenario_name} not found")
            return {
                "scenario": scenario_name,
                "success": False,
                "error": "Scenario not found"
            }
            
        scenario = scenario_class(
            self.components, 
            self._load_scenario_data(scenario_name),
            self.config,
            self.performance_monitor
        )
        
        try:
            # Start scenario timer
            timer_name = f"scenario.{scenario_name}"
            self.performance_monitor.start_timer(timer_name)
            
            # Set up scenario
            self.logger.info(f"Setting up scenario: {scenario_name}")
            await scenario.setup()
            
            # Execute the scenario
            self.logger.info(f"Executing scenario: {scenario_name}")
            results = await scenario.execute()
            
            # Validate results
            self.logger.info(f"Validating results for scenario: {scenario_name}")
            assertions = await scenario.validate(results)
            
            # End scenario timer
            execution_time = self.performance_monitor.end_timer(timer_name)
            
            # Compile test result
            success = all(assertion.success for assertion in assertions)
            test_result = {
                "scenario": scenario_name,
                "success": success,
                "execution_time": execution_time,
                "assertions": [a.to_dict() for a in assertions],
                "data": results
            }
            
            self.results.append(test_result)
            self.logger.info(f"Scenario {scenario_name} completed: {'SUCCESS' if success else 'FAILURE'}")
            
            return test_result
            
        except Exception as e:
            self.logger.error(f"Error in scenario {scenario_name}: {str(e)}")
            self.performance_monitor.end_timer(timer_name)
            
            error_result = {
                "scenario": scenario_name,
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }
            self.results.append(error_result)
            
            # Depending on your error handling policy, you might want to re-raise or return
            return error_result
            
        finally:
            # Clean up scenario
            try:
                self.logger.info(f"Cleaning up scenario: {scenario_name}")
                await scenario.teardown()
            except Exception as e:
                self.logger.error(f"Error during scenario teardown: {str(e)}")
    
    async def run_all_scenarios(self):
        """
        Run all configured test scenarios.
        
        Returns:
            List of result dictionaries, one per scenario
        """
        self.logger.info("Running all scenarios")
        results = []
        
        for scenario_name in self.config.get("scenarios", []):
            try:
                result = await self.run_scenario(scenario_name)
                results.append(result)
            except Exception as e:
                self.logger.error(f"Failed to run scenario {scenario_name}: {str(e)}")
                results.append({
                    "scenario": scenario_name,
                    "success": False,
                    "error": str(e)
                })
        
        return results
    
    async def shutdown(self):
        """
        Clean up resources and shut down the test harness.
        
        Returns:
            Dictionary with summary information
        """
        self.logger.info("Shutting down test harness")
        
        # Clean up environment
        await self.environment_manager.teardown_environment()
        
        # Stop performance monitoring
        metrics = self.performance_monitor.stop()
        
        # Generate report
        self.reporter.add_results(self.results)
        self.reporter.add_metrics(metrics)
        report_path = await self.reporter.save_report()
        
        summary = {
            "total_scenarios": len(self.results),
            "successful_scenarios": sum(1 for r in self.results if r.get("success", False)),
            "failed_scenarios": sum(1 for r in self.results if not r.get("success", False)),
            "report_path": report_path
        }
        
        self.logger.info(f"Test harness shutdown complete. Report saved to {report_path}")
        return summary
    
    def _get_scenario_class(self, scenario_name):
        """Get the scenario class by name."""
        try:
            # Import dynamically
            module_name = f"marvin_test_harness.scenarios.{scenario_name}"
            class_name = ''.join(word.capitalize() for word in scenario_name.split('_')) + 'Scenario'
            
            # Try to import
            module = __import__(module_name, fromlist=[class_name])
            return getattr(module, class_name)
        except (ImportError, AttributeError) as e:
            self.logger.error(f"Failed to load scenario class {scenario_name}: {str(e)}")
            return None
    
    def _load_scenario_data(self, scenario_name):
        """Load test data for a scenario."""
        try:
            import json
            from pathlib import Path
            
            # Construct the path to the scenario data file
            fixtures_dir = Path(self.config.get("fixtures", {}).get("dir", "fixtures"))
            data_file = fixtures_dir / f"{scenario_name}.json"
            
            if data_file.exists():
                with open(data_file, 'r') as f:
                    return json.load(f)
            else:
                self.logger.warning(f"Scenario data file not found: {data_file}")
                return {}
        except Exception as e:
            self.logger.error(f"Error loading scenario data: {str(e)}")
            return {}