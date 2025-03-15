import json
from core.utils.logger import get_logger
from test_harness.utils.paths import resolve_api_path

logger = get_logger(__name__)

async def diagnose_request_handling(api_service):
    """
    Run diagnostic tests on the API request handling.
    
    Args:
        api_service: API service instance
        
    Returns:
        Diagnostic results
    """
    logger = get_logger("test.diagnostics")
    logger.info("=== Starting API Request Handling Diagnostics ===")
    
    results = {}
    
    # Test 1: API Service Information
    logger.info("Diagnostic 1: API Service Information")
    service_info = {
        "type": type(api_service).__name__,
        "config": {k: v for k, v in api_service.config.items() if k != "admin_token"}
    }
    logger.info(f"API Service: {service_info['type']}")
    logger.info(f"API Config: {json.dumps(service_info['config'])}")
    results["api_service"] = service_info
    
    # Test 2: Route Information
    logger.info("Diagnostic 2: Route Information")
    route_info = {}
    for method, routes in api_service.routes.items():
        route_info[method] = list(routes.keys())
        logger.info(f"{method} Routes: {route_info[method]}")
    results["routes"] = route_info
    
    # Test 3: Basic Page Creation
    logger.info("Diagnostic 3: Basic Page Creation")
    # Simple test data for a page creation request
    page_data = {
        "url": "https://example.com/diagnostic",
        "title": "Diagnostic Test Page",
        "context": "TEST",
        "browser_contexts": ["TEST"],
        "tab_id": "test_tab",
        "window_id": "1"
    }
    
    logger.info(f"Sending test page data: {json.dumps(page_data)}")
    try:
        page_response = await api_service.send_request(
            "POST",
            "/pages",
            page_data
        )
        logger.info(f"Page creation response: {json.dumps(page_response)}")
        results["page_creation"] = {
            "success": page_response.get("success", False),
            "data": page_data,
            "response": page_response
        }
    except Exception as e:
        logger.error(f"Page creation test failed with exception: {str(e)}")
        results["page_creation"] = {
            "success": False,
            "data": page_data,
            "error": str(e)
        }
    
    # Test 4: Path Resolution
    logger.info("Diagnostic 4: Path Resolution")
    test_paths = [
        "/pages",
        "/api/v1/pages",
        "pages",
        "/api/v1/graph/related/https%3A%2F%2Fexample.com"
    ]
    
    path_results = []
    for path in test_paths:
        try:
            resolved = resolve_api_path(path, api_service.config)
            logger.info(f"Path '{path}' resolves to '{resolved}'")
            path_results.append({
                "original": path,
                "resolved": resolved
            })
        except Exception as e:
            logger.error(f"Path resolution failed for '{path}': {str(e)}")
            path_results.append({
                "original": path,
                "error": str(e)
            })
    
    results["path_resolution"] = path_results
    
    logger.info("=== API Request Handling Diagnostics Complete ===")
    return results

async def test_basic_functionality(api_client):
    """Test basic API functionality."""
    logger.info("Testing basic API functionality")
    
    try:
        # Try the test endpoint first
        test_request = {
            "url": "https://example.com/test",
            "context": "active_tab" 
        }
        
        logger.debug(f"Sending test request: {test_request}")
        test_response = await api_client.send_request(
            "POST",
            "/api/v1/analysis/test",
            test_request
        )
        
        # Log the full response for debugging
        logger.debug(f"Test endpoint full response: {test_response}")
        
        if test_response.get("success", False):
            logger.info("Test endpoint working - task system functional")
            task_id = test_response["data"]["task_id"]
            
            # Verify we can get the status
            status_response = await api_client.send_request(
                "GET",
                f"/api/v1/analysis/status/{task_id}"
            )
            
            if status_response.get("success", False):
                logger.info("Status endpoint working - found test task")
                return True
        
        # If test endpoint not available, try the regular analyze endpoint
        logger.info("Test endpoint not available, trying regular analyze endpoint")
        
        # Try different formats to find the right one
        for context_value in ["active_tab", "ACTIVE_TAB", "ActiveTab"]:
            analyze_request = {
                "url": "https://example.com/test-minimal",
                "context": context_value
            }
            
            logger.debug(f"Sending analyze request with context={context_value}: {analyze_request}")
            analyze_response = await api_client.send_request(
                "POST",
                "/api/v1/analysis/analyze",
                analyze_request
            )
            
            # Log full response for debugging
            logger.debug(f"Analyze endpoint full response: {analyze_response}")
            
            if analyze_response.get("success", False):
                logger.info(f"Request succeeded with context={context_value}")
                task_id = analyze_response["data"]["task_id"]
                
                # Just check if status endpoint responds
                status_response = await api_client.send_request(
                    "GET",
                    f"/api/v1/analysis/status/{task_id}"
                )
                
                if status_response.get("success", False) or "task_id" in status_response.get("data", {}):
                    logger.info("Basic task creation and status checking working")
                    return True
    
    except Exception as e:
        logger.error(f"Error testing basic functionality: {str(e)}", exc_info=True)
    
    logger.error("Basic functionality test failed")
    return False

# async def run_api_diagnostics(config: Dict[str, Any], components: Dict[str, Any]) -> None:
#     """
#     Run API diagnostics and print results.
    
#     Args:
#         config: Test configuration
#         components: Test components including API service
#     """
#     api_service = components.get("api")
#     if not api_service:
#         print("ERROR: API service not found in components")
#         return
    
#     print("\n== API Path Handling Diagnostics ==\n")
    
#     # Run diagnostics
#     results = await diagnose_api_paths(config, api_service)
    
#     # Print summary
#     print(f"API Prefix: {results['config']['api_prefix']}")
#     print(f"Problems found: {results['problems_found']}")
    
#     # Print test results
#     for test in results["tests"]:
#         status = "✅" if test.get("request_success") else "❌"
#         prefix_added = "→" if test.get("prefix_added") else "="
#         print(f"{status} {test['original_path']} {prefix_added} {test['resolved_path']}")
    
#     if results["problems_found"] > 0:
#         print("\n⚠️ Some API path issues were detected! Check the logs for details.")
#     else:
#         print("\n✅ API path handling appears to be working correctly.")