from core.utils.logger import get_logger
from core.infrastructure.database.transactions import Transaction
from test_harness.utils.helpers import wait_for_task_completion
import urllib.parse

logger = get_logger(__name__)

async def run(controller, config):
    """
    Test the complete content workflow with real components.
    
    Args:
        controller: TestHarnessController instance
        config: Test configuration
        
    Returns:
        Result dictionary with success status and details
    """
    logger.info("Running content workflow scenario")
    
    # Access components through controller
    api = controller.components.get("api")
    neo4j = controller.components.get("neo4j")
    
    # Get graph operations manager if using real Neo4j
    graph_manager = None
    if hasattr(neo4j, "get_graph_manager"):
        graph_manager = neo4j.get_graph_manager()
        logger.info("Using real graph operations manager")
    
    # Get auth token
    auth_token = await api.setup_test_auth()
    
    # Get test URLs from config
    workflow_config = config.get("scenarios", {}).get("content_workflow", {})
    urls = get_test_urls(workflow_config)
    
    # Track results
    results = {
        "success": True,
        "processed_urls": [],
        "failed_urls": [],
        "details": {}
    }
    
    # Process each URL
    for url in urls:
        logger.info(f"Processing URL: {url}")
        
        try:
            # Step 1: Submit to API for processing
            creation_response = await api.send_request(
                "POST", 
                "/api/v1/pages", 
                {
                    "url": url,
                    "context": "TEST",
                    "browser_contexts": ["TEST"]
                },
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            if not creation_response.get("success", False):
                logger.error(f"Failed to create page for {url}: {creation_response.get('error')}")
                results["failed_urls"].append(url)
                results["details"][url] = {
                    "status": "failed",
                    "error": creation_response.get("error"),
                    "stage": "creation"
                }
                continue
            
            # Extract task and page IDs
            task_id = creation_response["data"]["task_id"]
            page_id = creation_response["data"].get("page_id")
            
            # Step 2: Wait for processing to complete
            processing_result = await wait_for_task_completion(
                api, task_id, auth_token, max_wait=60
            )
            
            if not processing_result.get("success", False) or processing_result["data"]["status"] != "completed":
                logger.error(f"Processing failed for {url}: {processing_result}")
                results["failed_urls"].append(url)
                results["details"][url] = {
                    "status": "failed",
                    "error": processing_result.get("error"),
                    "stage": "processing"
                }
                continue
            
            # Step 3: Verify in Neo4j and check relationships using transaction
            async with neo4j.transaction() as tx:
                # Verify page exists in Neo4j
                if graph_manager:
                    # For real Neo4j, use graph operation manager
                    nodes = await graph_manager.query_nodes(
                        "Page", 
                        {"url": url},
                        transaction=tx
                    )
                    page_exists = len(nodes) > 0
                    
                    # Get page metadata if it exists
                    page_data = nodes[0].properties if page_exists else {}
                else:
                    # For mock Neo4j, use the provided methods
                    page_exists = await neo4j.page_exists(url)
                    page_data = {}
                
                if not page_exists:
                    logger.error(f"Page not found in Neo4j for {url}")
                    results["failed_urls"].append(url)
                    results["details"][url] = {
                        "status": "failed",
                        "error": "Page not found in Neo4j",
                        "stage": "verification"
                    }
                    continue
                
                # Check for keywords and relationships
                if graph_manager:
                    # For real Neo4j, use graph operation manager queries
                    keyword_result = await neo4j.execute_query(
                        """
                        MATCH (p:Page {url: $url})-[r:HAS_KEYWORD]->(k:Keyword)
                        RETURN k.text as text, r.weight as weight
                        """,
                        {"url": url},
                        transaction=tx
                    )
                    
                    has_keywords = len(keyword_result) > 0
                    keywords = {record["text"]: record["weight"] for record in keyword_result}
                    
                    # Check relationships
                    relation_result = await neo4j.execute_query(
                        """
                        MATCH (p:Page {url: $url})-[r]->(o)
                        WHERE type(r) <> 'HAS_KEYWORD'
                        RETURN type(r) as type, id(o) as target_id
                        """,
                        {"url": url},
                        transaction=tx
                    )
                    
                    has_relations = len(relation_result) > 0
                    relations = [{"type": record["type"], "target_id": record["target_id"]} 
                                for record in relation_result]
                else:
                    # For mock Neo4j, use the provided methods
                    has_keywords = await neo4j.has_keywords(url)
                    keywords = {}
                    has_relations = await neo4j.has_relationships(url)
                    relations = []
            
            # Step 4: Query the page via the API
            encoded_url = urllib.parse.quote(url, safe='')
            query_response = await api.send_request(
                "GET",
                f"/api/v1/graph/related/{encoded_url}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            
            # Record success
            results["processed_urls"].append(url)
            results["details"][url] = {
                "status": "success",
                "page_id": page_id,
                "has_keywords": has_keywords,
                "keywords_count": len(keywords) if isinstance(keywords, dict) else 0,
                "has_relations": has_relations,
                "relations_count": len(relations) if isinstance(relations, list) else 0,
                "query_success": query_response.get("success", False),
                "page_data": page_data
            }
            
            logger.info(f"Successfully processed URL: {url}")
            
        except Exception as e:
            logger.error(f"Error processing {url}: {str(e)}")
            results["failed_urls"].append(url)
            results["details"][url] = {
                "status": "error",
                "error": str(e)
            }
            # Don't fail the entire test on one URL error
    
    # Update overall success
    results["success"] = len(results["failed_urls"]) == 0
    
    # Summary log
    logger.info(f"Content workflow completed: {len(results['processed_urls'])} successful, {len(results['failed_urls'])} failed")
    
    return results

def get_test_urls(config):
    """Extract test URLs from configuration."""
    urls = []
    
    # Check for direct URL list in config
    if "urls" in config:
        urls.extend(config["urls"])
    
    # Check for URL file in config
    if "url_file" in config:
        try:
            import json
            import os
            if os.path.exists(config["url_file"]):
                with open(config["url_file"], 'r') as f:
                    file_urls = json.load(f)
                    if isinstance(file_urls, list):
                        urls.extend(file_urls)
                    elif isinstance(file_urls, dict) and "urls" in file_urls:
                        urls.extend(file_urls["urls"])
        except Exception as e:
            logger.error(f"Error loading URL file: {str(e)}")
    
    # Use default URLs if none specified
    if not urls:
        urls = [
            "https://example.com/test1",
            "https://docs.python.org/3/tutorial/",
            "https://test.org/research-paper"
        ]
    
    return urls