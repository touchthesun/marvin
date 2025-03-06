import sys
import os
import asyncio
import argparse
import traceback
import logging
from typing import List, Optional

from core.utils.logger import get_logger
from test_harness.config import load_test_config
from test_harness.controller import TestHarnessController
from test_harness.utils.diagnostics import diagnose_request_handling

logger = get_logger("test.cli")

async def run_tests(args: argparse.Namespace):
    """
    Run the test harness with the given arguments.
    
    Args:
        args: Command line arguments
    """
    # Initialize logging based on args
    config = load_test_config(args.config)
    log_level = args.log_level or config.get("log_level")
    logger = get_logger("test.cli", log_level)

    logger.info(f"Starting Marvin Test Harness with config: {args.config}")
    
    if args.scenario:
        logger.info(f"Running specific scenario: {args.scenario}")
    else:
        logger.info("Running all scenarios")
    
    # Set config overrides
    if args.use_real_api:
        logger.info("Using real API (command line override)")
        config["use_real_api"] = True
    
    if args.use_docker:
        logger.info("Using Docker for services (command line override)")
        config["use_docker"] = True
    
    if args.report_dir:
        logger.info(f"Using custom report directory: {args.report_dir}")
        if "reporting" not in config:
            config["reporting"] = {}
        config["reporting"]["report_dir"] = args.report_dir

    try:
        # Initialize controller
        logger.info("Initializing test harness controller")
        controller = TestHarnessController(args.config)
        await controller.initialize()

        # Run diagnostics if requested
        if args.diagnostics:
            logger.info("Running diagnostics tests")
            diagnostic_results = await run_diagnostics(controller.components)
            logger.info("Diagnostics complete")
            
            # If only diagnostics were requested, exit now
            if not args.scenario:
                logger.info("Shutting down test harness after diagnostics")
                await controller.shutdown()
                return 0
        
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
        logger.info("Shutting down test harness")
        summary = await controller.shutdown()
        
        # Print report path
        logger.info(f"Report available at: {summary.get('report_path')}")
        
        # Return exit code based on success
        return 0 if summary.get("failed_scenarios", 0) == 0 else 1
    
    except Exception as e:
        logger.error(f"Error running tests: {str(e)}")
        logger.error(traceback.format_exc())
        return 1
    

async def run_diagnostics(components):
    """
    Run diagnostic tests to help identify issues.
    
    Args:
        components: Test components
        
    Returns:
        Diagnostic results
    """

    logger = get_logger("test_harness.main")
    logger.info("Running diagnostics...")
    
    results = await diagnose_request_handling(components.get("api"))
    
    # Log a summary of results
    logger.info("Diagnostic results summary:")
    for test, result in results.items():
        if isinstance(result, dict) and "success" in result:
            logger.info(f"  {test}: {'SUCCESS' if result['success'] else 'FAILURE'}")
        else:
            logger.info(f"  {test}: Completed")
    
    return results

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
        "--diagnostics",
        action="store_true",
        help="Run diagnostic tests to troubleshoot issues"
    )
    
    parser.add_argument(
        "--scenario", 
        help="Run a specific scenario (omit to run all or use with --diagnostics only)"
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
    
    parser.add_argument(
        "--log-file",
        help="Path to save logs (in addition to console output)"
    )

    parser.add_argument(
        "--log-dir",
        help="Directory for log files (default: logs)"
    )
        
    args = parser.parse_args(argv)
    
    # Configure initial logging
    log_level = args.log_level or "INFO"
    logger = get_logger("test", log_level)
    
    # Configure file logging
    log_dir = args.log_dir or "logs"
    os.makedirs(log_dir, exist_ok=True)  # Create logs directory if it doesn't exist

    # Generate default log filename if none specified
    if not args.log_file:
        # Create timestamped log filename
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        args.log_file = os.path.join(log_dir, f"test_harness_{timestamp}.log")

    logger.info(f"Logging to file: {args.log_file}")

    # Add file handler to root logger
    log_handler = logging.FileHandler(args.log_file, mode='w', encoding='utf-8')
    log_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    log_handler.setFormatter(log_formatter)
    log_handler.setLevel(getattr(logging, log_level))
    logging.getLogger().addHandler(log_handler)

    
    logger.info("Marvin Test Harness starting")
    
    # Run the test harness
    try:
        exit_code = asyncio.run(run_tests(args))
        logger.info(f"Test harness completed with exit code: {exit_code}")
        return exit_code
    except Exception as e:
        logger.critical(f"Unhandled exception in test harness: {str(e)}")
        logger.critical(traceback.format_exc())
        return 2

if __name__ == "__main__":
    sys.exit(main())