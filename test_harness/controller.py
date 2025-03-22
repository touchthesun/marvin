import traceback
import json
from typing import Union

from core.utils.logger import get_logger
from test_harness.utils.paths import resolve_path
from test_harness.config import load_test_config
from test_harness.config_model import TestConfig
from test_harness.environment import TestEnvironmentManager
from test_harness.monitoring import PerformanceMonitor
from test_harness.reporting import TestReporter


class TestHarnessController:
    """
    Central controller for the test harness. Coordinates test execution,
    environment setup/teardown, and result collection.
    """
    
    def __init__(self, config_path_or_obj: Union[str, TestConfig]):
        """
        Initialize the test harness controller.
        
        Args:
            config_path_or_obj: Path to the test configuration file or pre-configured TestConfig object
        """
        # Handle either a path to config or a pre-configured object
        if isinstance(config_path_or_obj, str):
            self.config_path = config_path_or_obj
            self.config = load_test_config(config_path_or_obj)
        else:
            self.config_path = "pre-configured"
            self.config = config_path_or_obj
            
        self.logger = get_logger("test.controller", self.config.logging_level)
        self.logger.info(f"Initializing test controller with config from {self.config_path}")
        
        # Log Neo4j configuration for debugging
        if hasattr(self.config, "neo4j") and self.config.neo4j:
            self.logger.debug(f"Controller initialized with Neo4j config: {self.config.neo4j}")
        
        self.results = []
        self.components = {}
        self.environment_manager = TestEnvironmentManager(self.config)
        self.performance_monitor = PerformanceMonitor(self.config)
        self.reporter = TestReporter(self.config)
        
        self.logger.debug("Test harness controller initialized with components:")
        self.logger.debug(f"- Environment Manager: {self.environment_manager.__class__.__name__}")
        self.logger.debug(f"- Performance Monitor: {self.performance_monitor.__class__.__name__}")
        self.logger.debug(f"- Reporter: {self.reporter.__class__.__name__}")
    
    async def initialize(self):
        """
        Set up all test components based on configuration.
        
        Returns:
            The controller instance for method chaining
        """
        self.logger.info("Initializing test harness environment")
        
        # Start performance monitoring
        self.performance_monitor.start()
        self.logger.debug("Performance monitoring started")
        
        # Initialize environment
        self.logger.info("Setting up test environment")
        try:
            environment = await self.environment_manager.setup_environment()
            
            # Store component references
            self.components = {
                "neo4j": environment.get("neo4j"),
                "api": environment.get("api"),
                "browser": environment.get("browser_simulator"),
                "llm": environment.get("llm_mock")
            }
            
            self.logger.debug("Initialized components:")
            for name, component in self.components.items():
                self.logger.debug(f"- {name}: {component.__class__.__name__}")
            
            self.logger.info("Test harness initialized successfully")
            return self
        except Exception as e:
            self.logger.error(f"Failed to initialize test environment: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise
    
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
            
        self.logger.debug(f"Using scenario class: {scenario_class.__name__}")
        
        # Load scenario data
        scenario_data = self._load_scenario_data(scenario_name)
        self.logger.debug(f"Loaded scenario data with {len(scenario_data) if scenario_data else 0} keys")
        
        # Initialize scenario
        scenario = scenario_class(
            self.components, 
            scenario_data,
            self.config,
            self.performance_monitor
        )
        
        try:
            # Start scenario timer
            timer_name = f"scenario.{scenario_name}"
            self.performance_monitor.start_timer(timer_name)
            self.logger.debug(f"Started timer: {timer_name}")
            
            # Set up scenario
            self.logger.info(f"Setting up scenario: {scenario_name}")
            await scenario.setup()
            self.logger.debug(f"Scenario {scenario_name} setup completed")
            
            # Execute the scenario
            self.logger.info(f"Executing scenario: {scenario_name}")
            results = await scenario.execute()
            self.logger.debug(f"Scenario {scenario_name} execution completed")
            
            # Validate results
            self.logger.info(f"Validating results for scenario: {scenario_name}")
            assertions = await scenario.validate(results)
            self.logger.debug(f"Validation completed with {len(assertions)} assertions")
            
            # End scenario timer
            execution_time = self.performance_monitor.end_timer(timer_name)
            self.logger.debug(f"Scenario execution time: {execution_time:.3f}s")
            
            # Calculate success
            success = all(assertion.success for assertion in assertions)
            pass_count = sum(1 for a in assertions if a.success)
            fail_count = len(assertions) - pass_count
            
            # Compile test result
            test_result = {
                "scenario": scenario_name,
                "success": success,
                "execution_time": execution_time,
                "assertions": [a.to_dict() for a in assertions],
                "assertion_summary": {
                    "total": len(assertions),
                    "passed": pass_count,
                    "failed": fail_count
                },
                "data": results
            }
            
            self.results.append(test_result)
            
            status_str = "SUCCESS" if success else "FAILURE"
            self.logger.info(f"Scenario {scenario_name} completed: {status_str} ({pass_count}/{len(assertions)} assertions passed)")
            
            return test_result
            
        except Exception as e:
            self.logger.error(f"Error in scenario {scenario_name}: {str(e)}")
            self.logger.error(traceback.format_exc())
            self.performance_monitor.end_timer(timer_name)
            
            error_result = {
                "scenario": scenario_name,
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }
            self.results.append(error_result)
            
            return error_result
            
        finally:
            # Clean up scenario
            try:
                self.logger.info(f"Cleaning up scenario: {scenario_name}")
                await scenario.teardown()
                self.logger.debug(f"Scenario {scenario_name} cleanup completed")
            except Exception as e:
                self.logger.error(f"Error during scenario teardown: {str(e)}")
    
    async def run_all_scenarios(self):
        """
        Run all configured test scenarios.
        
        Returns:
            List of result dictionaries, one per scenario
        """
        scenario_list = self.config.get("scenarios", [])
        self.logger.info(f"Running all scenarios: {', '.join(scenario_list)}")
        results = []
        
        for scenario_name in scenario_list:
            try:
                self.logger.info(f"Starting scenario: {scenario_name}")
                result = await self.run_scenario(scenario_name)
                results.append(result)
                
                success_str = "succeeded" if result.get("success", False) else "failed"
                self.logger.info(f"Scenario {scenario_name} {success_str}")
            except Exception as e:
                self.logger.error(f"Failed to run scenario {scenario_name}: {str(e)}")
                self.logger.error(traceback.format_exc())
                results.append({
                    "scenario": scenario_name,
                    "success": False,
                    "error": str(e),
                    "traceback": traceback.format_exc()
                })
        
        # Summarize results
        passed = sum(1 for r in results if r.get("success", False))
        total = len(results)
        self.logger.info(f"All scenarios completed: {passed}/{total} passed")
        
        return results
    
    async def shutdown(self):
        """
        Clean up resources and shut down the test harness.
        
        Returns:
            Dictionary with summary information
        """
        self.logger.info("Shutting down test harness")
        
        # Clean up environment
        try:
            self.logger.info("Tearing down test environment")
            await self.environment_manager.teardown_environment()
            self.logger.info("Test environment teardown complete")
        except Exception as e:
            self.logger.error(f"Error during environment teardown: {str(e)}")
        
        # Stop performance monitoring
        self.logger.info("Stopping performance monitoring")
        metrics = self.performance_monitor.stop()
        self.logger.debug(f"Collected {len(metrics.get('timers', {})) if metrics else 0} timer metrics")
        
        # Generate report
        self.logger.info("Generating test report")
        self.reporter.add_results(self.results)
        self.reporter.add_metrics(metrics)
        report_path = await self.reporter.save_report()
        self.logger.info(f"Test report saved to {report_path}")
        
        # Compile summary
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
            module_name = f"test_harness.scenarios.{scenario_name}"
            class_name = ''.join(word.capitalize() for word in scenario_name.split('_')) + 'Scenario'
            
            self.logger.debug(f"Loading scenario class: {class_name} from {module_name}")
            
            # Try to import
            module = __import__(module_name, fromlist=[class_name])
            return getattr(module, class_name)
        except (ImportError, AttributeError) as e:
            self.logger.error(f"Failed to load scenario class {scenario_name}: {str(e)}")
            self.logger.error(traceback.format_exc())
            return None
    
    
    def _load_scenario_data(self, scenario_name):
        """Load test data for a scenario."""
        try:
            
            # Construct the path to the scenario data file
            fixtures_dir = self.config.get("fixtures", {}).get("dir", "fixtures")
            data_file_path = f"{fixtures_dir}/{scenario_name}.json"
            
            self.logger.debug(f"Looking for scenario data at: {data_file_path}")
            
            try:
                # Use our path resolution utility
                resolved_path = resolve_path(data_file_path)
                self.logger.debug(f"Resolved scenario data path: {resolved_path}")
                
                with open(resolved_path, 'r') as f:
                    data = json.load(f)
                    self.logger.debug(f"Loaded scenario data from {resolved_path}")
                    return data
            except FileNotFoundError:
                self.logger.warning(f"Scenario data file not found: {data_file_path}")
                return {}
        except Exception as e:
            self.logger.error(f"Error loading scenario data: {str(e)}")
            self.logger.error(traceback.format_exc())
            return {}