import sys
import asyncio
import argparse
from typing import List, Optional

from core.utils.logger import get_logger
from marvin_test_harness.controller import TestHarnessController

logger = get_logger("test.cli")

async def run_tests(args: argparse.Namespace):
    """
    Run the test harness with the given arguments.
    
    Args:
        args: Command line arguments
    """
    try:
        # Initialize controller
        controller = TestHarnessController(args.config)
        await controller.initialize()
        
        # Run scenarios
        if args.scenario:
            # Run a specific scenario
            logger.info(f"Running scenario: {args.scenario}")
            result = await controller.run_scenario(args.scenario)
            
            # Print result
            status = "PASSED" if result.get("success", False) else "FAILED"
            logger.info(f"Scenario {args.scenario} {status}")
        else:
            # Run all scenarios
            logger.info("Running all scenarios")
            results = await controller.run_all_scenarios()
            
            # Print results
            passed = sum(1 for r in results if r.get("success", False))
            total = len(results)
            logger.info(f"Scenarios: {passed}/{total} passed")
        
        # Shutdown and report
        summary = await controller.shutdown()
        
        # Print report path
        logger.info(f"Report available at: {summary.get('report_path')}")
        
        # Return exit code based on success
        return 0 if summary.get("failed_scenarios", 0) == 0 else 1
    
    except Exception as e:
        logger.error(f"Error running tests: {str(e)}")
        return 1

def main(argv: Optional[List[str]] = None):
    """
    Main entry point for the test harness CLI.
    
    Args:
        argv: Command line arguments (defaults to sys.argv[1:])
    
    Returns:
        Exit code (0 for success, non-zero for error)
    """
    parser = argparse.ArgumentParser(description="Marvin Test Harness")
    
    parser.add_argument(
        "--config", 
        default="config/test.json",
        help="Path to test configuration file"
    )
    
    parser.add_argument(
        "--scenario", 
        help="Run a specific scenario"
    )
    
    parser.add_argument(
        "--use-real-api", 
        action="store_true",
        help="Use real API instead of mock"
    )
    
    parser.add_argument(
        "--use-docker", 
        action="store_true",
        help="Use Docker for services like Neo4j"
    )
    
    parser.add_argument(
        "--log-level", 
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Set logging level"
    )
    
    parser.add_argument(
        "--report-dir", 
        help="Directory for test reports"
    )
    
    args = parser.parse_args(argv)
    
    # Run the test harness
    exit_code = asyncio.run(run_tests(args))
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())