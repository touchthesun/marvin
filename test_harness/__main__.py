import sys
import os
import asyncio
import argparse
import traceback
import logging
from typing import List, Optional

from test_harness.utils.generate_test_data import generate_test_data_files
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
        config.use_real_api = True
    
    if args.use_docker:
        logger.info("Using Docker for services (command line override)")
        config.use_docker = True
    
    # Handle Neo4j integration overrides
    if args.use_real_neo4j:
        logger.info("Using real Neo4j database (command line override)")
        
        # Initialize neo4j config dict if needed
        if not hasattr(config, "neo4j") or config.neo4j is None:
            config.neo4j = {}
        
        # Set use_real flag
        config.neo4j["use_real"] = True
        logger.debug(f"Set neo4j.use_real = {config.neo4j.get('use_real', False)}")
        
        # Ensure Neo4j credentials are copied to the neo4j dictionary
        if hasattr(config, "neo4j_uri") and config.neo4j_uri:
            config.neo4j["uri"] = config.neo4j_uri
            logger.debug(f"Set neo4j.uri = {config.neo4j['uri']}")
        if hasattr(config, "neo4j_username") and config.neo4j_username:
            config.neo4j["username"] = config.neo4j_username
            logger.debug(f"Set neo4j.username = {config.neo4j['username']}")
        if hasattr(config, "neo4j_password") and config.neo4j_password:
            config.neo4j["password"] = config.neo4j_password
            logger.debug(f"Set neo4j.password = (password hidden)")
        
        # Update connection details if provided via command line
        if args.neo4j_uri:
            logger.info(f"Using Neo4j URI: {args.neo4j_uri}")
            config.neo4j["uri"] = args.neo4j_uri
            config.neo4j_uri = args.neo4j_uri  # Also update the base attribute
            
        if args.neo4j_username:
            logger.info(f"Using Neo4j username: {args.neo4j_username}")
            config.neo4j["username"] = args.neo4j_username
            config.neo4j_username = args.neo4j_username
            
        if args.neo4j_password:
            logger.info("Using provided Neo4j password")
            config.neo4j["password"] = args.neo4j_password
            config.neo4j_password = args.neo4j_password
            
        # Verify that we have the necessary credentials
        if not config.neo4j.get("uri") or not config.neo4j.get("username") or not config.neo4j.get("password"):
            logger.warning("Missing Neo4j credentials. Please provide URI, username, and password.")
            if not config.neo4j.get("uri"):
                logger.warning("Missing Neo4j URI")
            if not config.neo4j.get("username"):
                logger.warning("Missing Neo4j username")
            if not config.neo4j.get("password"):
                logger.warning("Missing Neo4j password")
        else:
            logger.debug(f"Neo4j connection details: URI={config.neo4j['uri']}, username={config.neo4j['username']}")

    
    # Set report directory if specified
    if args.report_dir:
        logger.info(f"Using custom report directory: {args.report_dir}")
        if not hasattr(config, "reporting") or config.reporting is None:
            config.reporting = {}
        config.reporting["report_dir"] = args.report_dir

    # Generate test data if requested
    if args.generate_test_data:
        logger.info(f"Generating test data in {args.fixtures_dir}")
        try:

            generate_test_data_files(args.fixtures_dir, args.num_pages)
            logger.info("Test data generation complete")
        except Exception as e:
            logger.error(f"Error generating test data: {str(e)}")
            logger.error(traceback.format_exc())
            if args.fail_on_error:
                return 1

    try:
        # Initialize controller
        logger.info("Initializing test harness controller")
        controller = TestHarnessController(config)
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
        
        # Verify Neo4j connection if using real Neo4j
        if args.use_real_neo4j and args.verify_neo4j:
            logger.info("Verifying Neo4j connection")
            neo4j_component = controller.components.get("neo4j")
            if neo4j_component:
                try:
                    # Run a simple query to verify connection
                    result = await neo4j_component.execute_query("RETURN 1 as test")
                    if result and len(result) > 0 and result[0].get("test") == 1:
                        logger.info("Neo4j connection verified successfully")
                    else:
                        logger.error("Neo4j connection verification failed")
                        if args.fail_on_error:
                            await controller.shutdown()
                            return 1
                except Exception as e:
                    logger.error(f"Error verifying Neo4j connection: {str(e)}")
                    if args.fail_on_error:
                        await controller.shutdown()
                        return 1
            else:
                logger.error("Neo4j component not found in test harness")
                if args.fail_on_error:
                    await controller.shutdown()
                    return 1
        
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
    
    # Configuration options
    parser.add_argument(
        "--config", 
        default="config/test.json",
        help="Path to test configuration file"
    )

    # Test execution options
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="Run diagnostic tests to troubleshoot issues"
    )
    
    parser.add_argument(
        "--scenario", 
        help="Run a specific scenario (omit to run all or use with --diagnostics only)"
    )
    
    # Test service options
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
    
    # Neo4j integration options
    parser.add_argument(
        "--use-real-neo4j",
        action="store_true",
        help="Use real Neo4j database instead of mock"
    )
    
    parser.add_argument(
        "--neo4j-uri",
        help="Neo4j database URI (e.g., bolt://localhost:7687)"
    )
    
    parser.add_argument(
        "--neo4j-username",
        help="Neo4j database username"
    )
    
    parser.add_argument(
        "--neo4j-password",
        help="Neo4j database password"
    )
    
    parser.add_argument(
        "--verify-neo4j",
        action="store_true",
        help="Verify Neo4j connection before running tests"
    )
    
    # Test data options
    parser.add_argument(
        "--generate-test-data",
        action="store_true",
        help="Generate test data before running tests"
    )
    
    parser.add_argument(
        "--fixtures-dir",
        default="fixtures",
        help="Directory for test fixtures"
    )
    
    parser.add_argument(
        "--num-pages",
        type=int,
        default=15,
        help="Number of pages to generate for test data"
    )
    
    # Error handling option
    parser.add_argument(
        "--fail-on-error",
        action="store_true",
        help="Exit immediately on setup errors"
    )
    
    # Logging options
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
    log_dir = args.log_dir or "test_harness/logs"
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