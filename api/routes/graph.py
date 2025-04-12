from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from urllib.parse import unquote
from uuid import UUID, uuid4
from datetime import datetime

from core.utils.logger import get_logger
from core.services.graph.graph_service import GraphService
from api.utils.helpers import get_domain_from_url
from api.dependencies import get_graph_service
from api.state import get_app_state
from api.models.page.response import PageResponse
from api.models.graph.response import GraphResponse
from api.models.graph.response import (
    GraphResponse, 
    GraphNode, 
    GraphData, 
    GraphEdge
) 

# Initialize logger
logger = get_logger(__name__)
router = APIRouter(prefix="/graph", tags=["graph"])

@router.get("/related/{url:path}", response_model=GraphResponse)
async def get_related_pages(
    url: str,
    depth: int = Query(default=1, ge=1, le=3),
    relationship_types: Optional[List[str]] = Query(default=None),
    graph_service: GraphService = Depends(get_graph_service)
):
    """Get pages related to the given URL."""
    try:
        # Ensure URL is properly decoded
        decoded_url = unquote(url)
        logger.info(f"Finding related pages for URL: {decoded_url} with depth {depth}")
        
        results = await graph_service.find_related_content(
            url=decoded_url,
            min_relevance=0.0,  # We can adjust this or expose it as a parameter
            max_results=10 * depth  # Scale results by depth
        )

        # Process results to fit the expected GraphData model
        nodes = []
        edges = []
        seen_nodes = set()
        
        # Only process results if we have any
        if results:
            # Add nodes to the response
            for result in results:
                page = result["page"]
                if page["url"] not in seen_nodes:
                    nodes.append(GraphNode(
                        id=UUID(page.get("id", str(uuid4()))),
                        url=page["url"],
                        domain=page.get("domain", get_domain_from_url(page["url"])),
                        title=page.get("title"),
                        last_active=page.get("last_active"),
                        metadata=page.get("metadata", {})
                    ))
                    seen_nodes.add(page["url"])
                
                # Add edge to response
                rel = result["relationship"]
                edges.append(GraphEdge(
                    source_id=UUID(rel.get("source_id", str(uuid4()))),
                    target_id=UUID(rel.get("target_id", str(uuid4()))),
                    type=rel.get("type", "unknown"),
                    strength=float(rel.get("strength", 0.5)),
                    metadata=rel.get("metadata", {})
                ))
        
        # Create the GraphData - always include this even if empty
        graph_data = GraphData(
            nodes=nodes,
            edges=edges,
            metadata={
                "query_url": decoded_url,
                "depth": depth,
                "node_count": len(nodes),
                "edge_count": len(edges),
                "results_found": len(results) > 0  # Add this for debugging
            }
        )
        
        # Always return success=True for HTTP 200 responses, even if results are empty
        # This is what the test expects
        return GraphResponse(
            success=True,
            data=graph_data,
            metadata={
                "timestamp": datetime.now().isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Error getting related pages: {str(e)}", exc_info=True)
        # Return error response matching your API format
        return GraphResponse(
            success=False,
            error={
                "error_code": "GRAPH_ERROR",
                "message": f"Failed to get related pages: {str(e)}",
                "details": {"url": url}
            },
            metadata={
                "timestamp": datetime.now().isoformat()
            }
        )
    


@router.get("/search", response_model=GraphResponse)
async def search_graph(
    query: str,
    limit: int = 100,
    graph_service = Depends(get_graph_service)
):
    results = await graph_service.query_pages(
        url_pattern=query,
        limit=limit
    )
    
    return GraphResponse(
        success=True,
        nodes=results,
        relationships=[]
    )
 
@router.get("/page/{url:path}", response_model=PageResponse)
async def get_page_by_url(
    url: str,
    graph_service: GraphService = Depends(get_graph_service)
):
    """Get a page by URL."""
    try:
        # Ensure URL is properly decoded
        decoded_url = unquote(url)
        logger.info(f"Getting page for URL: {decoded_url}")
        
        # Use transaction for consistency
        async with graph_service.graph_operations.transaction() as tx:
            # Get the page as a domain object
            page = await graph_service._get_page_by_url(tx, decoded_url)
            
            if not page:
                logger.warning(f"Page not found for URL: {decoded_url}")
                return PageResponse(
                    success=False,
                    error={
                        "error_code": "PAGE_NOT_FOUND",
                        "message": f"Page not found for URL: {decoded_url}"
                    }
                )
            
            # Convert domain object to API model format - handle both dictionary and object formats
            if hasattr(page, 'to_dict'):
                page_data = page.to_dict()
            elif isinstance(page, dict):
                page_data = page
            else:
                # If it's neither a dict nor has to_dict method, try to convert it directly
                page_data = dict(page) if hasattr(page, '__dict__') else page
            
            # Ensure ID is properly formatted as string
            if 'id' in page_data and page_data['id'] is not None:
                page_data['id'] = str(page_data['id'])
                
            # Return success response with converted data
            return PageResponse(
                success=True,
                data=page_data
            )
            
    except Exception as e:
        logger.error(f"Error getting page: {str(e)}", exc_info=True)
        return PageResponse(
            success=False, 
            error={
                "message": f"Error retrieving page: {str(e)}"
            }
        )


@router.get("/overview", response_model=GraphResponse)
async def get_graph_overview(
    limit: int = Query(default=100, ge=1, le=500),
    include_empty: bool = Query(default=False),
    graph_service: GraphService = Depends(get_graph_service)
):
    """
    Get an overview of the entire knowledge graph.
    
    This endpoint retrieves a limited subset of nodes and edges from the graph
    for visualization purposes.
    """
    try:
        logger.info(f"Getting graph overview with limit: {limit}")
        
        # Access the database connection through the graph operations
        db_connection = graph_service.graph_operations.connection
        
        # Execute transaction for consistency
        async with graph_service.graph_operations.transaction() as tx:
            # Get nodes with a reasonable limit
            nodes_query = f"""
            MATCH (p:Page)
            RETURN 
                p,
                id(p) as node_id,
                p.url as url,
                p.domain as domain,
                p.title as title,
                p.last_active as last_active
            LIMIT {limit}
            """
            
            nodes_result = await db_connection.execute_query(
                nodes_query,
                transaction=tx
            )
            
            # Convert to GraphNode objects
            nodes = []
            node_ids = set()
            id_mapping = {}  # Map Neo4j IDs to generated UUIDs
            
            for item in nodes_result:
                node_id = item["node_id"]
                node_ids.add(node_id)
                
                # Generate a UUID for each node instead of trying to convert the Neo4j ID
                generated_uuid = uuid4()
                id_mapping[node_id] = generated_uuid
                
                nodes.append(GraphNode(
                    id=generated_uuid,
                    url=item["url"],
                    domain=item.get("domain", get_domain_from_url(item["url"])),
                    title=item.get("title"),
                    last_active=item.get("last_active"),
                    metadata={"neo4j_id": str(node_id)}
                ))
            
            # Get edges between these nodes
            edges_query = f"""
            MATCH (p1:Page)-[r]->(p2:Page)
            WHERE id(p1) IN $node_ids AND id(p2) IN $node_ids
            RETURN 
                id(p1) as source_id,
                id(p2) as target_id,
                type(r) as rel_type,
                r.score as score,
                properties(r) as properties
            LIMIT {limit * 2}
            """
            
            # Use the actual Neo4j IDs for the query
            edges_result = await db_connection.execute_query(
                edges_query,
                parameters={"node_ids": list(node_ids)},
                transaction=tx
            )
            
            # Convert to GraphEdge objects using our ID mapping
            edges = []
            for item in edges_result:
                source_neo4j_id = item["source_id"]
                target_neo4j_id = item["target_id"]
                
                # Use our mapping to get the corresponding UUIDs
                if source_neo4j_id in id_mapping and target_neo4j_id in id_mapping:
                    edges.append(GraphEdge(
                        source_id=id_mapping[source_neo4j_id],
                        target_id=id_mapping[target_neo4j_id],
                        type=item["rel_type"],
                        strength=float(item.get("score", 0.5)),
                        metadata=item.get("properties", {})
                    ))
            
            # Create graph data response
            graph_data = GraphData(
                nodes=nodes,
                edges=edges,
                metadata={
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                    "total_nodes": len(nodes_result),
                    "is_complete": len(nodes) < limit,
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            return GraphResponse(
                success=True,
                data=graph_data,
                metadata={
                    "timestamp": datetime.now().isoformat()
                }
            )
            
    except Exception as e:
        logger.error(f"Error getting graph overview: {str(e)}", exc_info=True)
        return GraphResponse(
            success=False,
            error={
                "error_code": "GRAPH_ERROR",
                "message": f"Failed to get graph overview: {str(e)}",
                "details": {}
            },
            metadata={
                "timestamp": datetime.now().isoformat()
            }
        )
    

@router.post("/initialize-schema", response_model=GraphResponse)
async def initialize_schema(
    graph_service: GraphService = Depends(get_graph_service),
    app_state = Depends(get_app_state)
):
    """Initialize schema for embeddings and other graph operations."""
    try:
        logger.info("Initializing graph schema")
        
        if not app_state.embedding_service:
            return GraphResponse(
                success=False,
                error={
                    "error_code": "SERVICE_ERROR",
                    "message": "Embedding service not available"
                },
                metadata={
                    "timestamp": datetime.now().isoformat()
                }
            )
        
        # Create transaction for schema initialization
        async with graph_service.graph_operations.transaction() as tx:
            # Initialize schema using embedding service
            success = await app_state.embedding_service.initialize_schema(tx)
            
            if success:
                logger.info("Schema initialized successfully")
                # Return an empty but valid graph response
                return GraphResponse(
                    success=True,
                    data=GraphData(
                        nodes=[],  # Empty nodes list
                        edges=[],  # Empty edges list
                        metadata={
                            "message": "Schema initialized successfully",
                            "timestamp": datetime.now().isoformat()
                        }
                    ),
                    metadata={
                        "timestamp": datetime.now().isoformat()
                    }
                )
            else:
                logger.warning("Schema initialization returned false")
                return GraphResponse(
                    success=False,
                    error={
                        "error_code": "SCHEMA_ERROR",
                        "message": "Schema initialization failed"
                    },
                    metadata={
                        "timestamp": datetime.now().isoformat()
                    }
                )
    except Exception as e:
        logger.error(f"Error initializing schema: {str(e)}", exc_info=True)
        return GraphResponse(
            success=False,
            error={
                "error_code": "SCHEMA_ERROR",
                "message": f"Failed to initialize schema: {str(e)}"
            },
            metadata={
                "timestamp": datetime.now().isoformat()
            }
        )