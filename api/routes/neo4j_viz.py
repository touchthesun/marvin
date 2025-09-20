from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional, Dict, Any
from urllib.parse import unquote
from datetime import datetime
import asyncio
from contextlib import asynccontextmanager

from core.utils.logger import get_logger
from core.services.graph.graph_service import GraphService
from api.dependencies import get_graph_service
from api.state import get_app_state
from api.models.graph.response import GraphResponse, GraphNode, GraphData, GraphEdge

# Import neo4j-viz components
try:
    from neo4j_viz.neo4j import from_neo4j
    from neo4j_viz.options import Layout, Renderer
    # Try to import ColorSpace, but it might not be available in all versions
    try:
        from neo4j_viz.options import ColorSpace
    except ImportError:
        ColorSpace = None
    NEO4J_VIZ_AVAILABLE = True
except ImportError:
    NEO4J_VIZ_AVAILABLE = False
    # Don't use logger here since it's not defined yet
    print("Warning: neo4j-viz not available, using fallback visualization")

# Initialize logger
logger = get_logger(__name__)
router = APIRouter(prefix="/graph/neo4j-viz", tags=["neo4j-viz"])

@router.get("/overview", response_model=GraphResponse)
async def get_neo4j_viz_overview(
    limit: int = Query(default=500, ge=1, le=1000),
    include_empty: bool = Query(default=False),
    layout: str = Query(default="force-directed", description="Layout algorithm: force-directed, hierarchical, grid"),
    renderer: str = Query(default="canvas", description="Renderer: canvas, webgl"),
    graph_service: GraphService = Depends(get_graph_service)
):
    """
    Get graph data formatted for neo4j-viz visualization.
    
    This endpoint provides data in the format expected by the neo4j-viz library,
    with proper node and relationship structures.
    """
    try:
        logger.info(f"Getting neo4j-viz overview with limit: {limit}, layout: {layout}, renderer: {renderer}")
        
        # Access the database connection through the graph operations
        db_connection = graph_service.graph_operations.connection
        
        # Execute transaction for consistency
        async with graph_service.graph_operations.transaction() as tx:
            # Get nodes with a reasonable limit (same logic as regular overview endpoint)
            nodes_query = f"""
            MATCH (p:Page)
            RETURN 
                p,
                id(p) as node_id,
                p.url as url,
                p.domain as domain,
                p.title as title,
                p.last_active as last_active,
                p.content_length as content_length,
                p.word_count as word_count
            LIMIT {limit}
            """
            
            nodes_result = await db_connection.execute_query(
                nodes_query,
                transaction=tx
            )
            
            # Convert to GraphNode objects with neo4j-viz compatible structure
            nodes = []
            node_ids = set()
            id_mapping = {}  # Map Neo4j IDs to generated UUIDs
            
            for item in nodes_result:
                neo4j_id = item["node_id"]
                if neo4j_id not in id_mapping:
                    # Generate a consistent UUID for this Neo4j ID
                    import uuid
                    node_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(neo4j_id)))
                    id_mapping[neo4j_id] = node_uuid
                
                node_uuid = id_mapping[neo4j_id]
                node_ids.add(node_uuid)
                
                # Create node with neo4j-viz compatible properties
                node = GraphNode(
                    id=node_uuid,
                    url=item["url"],
                    title=item["title"] or "Untitled",
                    domain=item["domain"],
                    last_active=item["last_active"],
                    properties={
                        "neo4j_id": neo4j_id,
                        "content_length": item.get("content_length", 0),
                        "word_count": item.get("word_count", 0),
                        "labels": ["Page"]
                    }
                )
                nodes.append(node)
            
            # Get relationships between the nodes we found
            if len(node_ids) > 1:
                # Create a parameterized query for the relationships
                node_id_list = list(node_ids)
                relationships_query = """
                MATCH (source:Page)-[r]->(target:Page)
                WHERE id(source) IN $source_ids AND id(target) IN $target_ids
                RETURN 
                    id(source) as source_id,
                    id(target) as target_id,
                    type(r) as rel_type,
                    r.score as score,
                    properties(r) as properties
                LIMIT 1000
                """
                
                # Convert UUIDs back to Neo4j IDs for the query
                neo4j_id_list = [neo4j_id for neo4j_id, uuid in id_mapping.items() if uuid in node_ids]
                
                edges_result = await db_connection.execute_query(
                    relationships_query,
                    parameters={"source_ids": neo4j_id_list, "target_ids": neo4j_id_list},
                    transaction=tx
                )
            else:
                edges_result = []
            
            # Convert to GraphEdge objects using our ID mapping
            edges = []
            for item in edges_result:
                source_neo4j_id = item["source_id"]
                target_neo4j_id = item["target_id"]
                
                # Use our mapping to get the corresponding UUIDs
                if source_neo4j_id in id_mapping and target_neo4j_id in id_mapping:
                    score = item.get("score")
                    strength = 0.5 if score is None else float(score)
                    
                    edge = GraphEdge(
                        source_id=id_mapping[source_neo4j_id],
                        target_id=id_mapping[target_neo4j_id],
                        type=item["rel_type"],
                        strength=strength,
                        metadata={
                            **item.get("properties", {}),
                            "neo4j_source_id": source_neo4j_id,
                            "neo4j_target_id": target_neo4j_id
                        }
                    )
                    edges.append(edge)
            
            # Create graph data response with neo4j-viz metadata
            graph_data = GraphData(
                nodes=nodes,
                edges=edges,
                metadata={
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                    "total_nodes": len(nodes_result),
                    "is_complete": len(nodes) < limit,
                    "layout": layout,
                    "renderer": renderer,
                    "neo4j_viz_compatible": True,
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            return GraphResponse(
                success=True,
                data=graph_data,
                metadata={
                    "timestamp": datetime.now().isoformat(),
                    "neo4j_viz_version": "1.0.0",
                    "layout_options": {
                        "force_directed": {"strength": 0.1, "iterations": 300},
                        "hierarchical": {"direction": "left", "packaging": "bin"},
                        "grid": {"spacing": 50}
                    }
                }
            )
            
    except Exception as e:
        logger.error(f"Error getting neo4j-viz overview: {str(e)}", exc_info=True)
        return GraphResponse(
            success=False,
            error={
                "error_code": "NEO4J_VIZ_ERROR",
                "message": f"Failed to get neo4j-viz overview: {str(e)}",
                "details": {"limit": limit, "layout": layout, "renderer": renderer}
            },
            metadata={
                "timestamp": datetime.now().isoformat()
            }
        )

@router.get("/related/{url:path}", response_model=GraphResponse)
async def get_neo4j_viz_related(
    url: str,
    depth: int = Query(default=1, ge=1, le=3),
    relationship_types: Optional[List[str]] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    graph_service: GraphService = Depends(get_graph_service)
):
    """
    Get pages related to the given URL in neo4j-viz format.
    """
    try:
        # Ensure URL is properly decoded
        decoded_url = unquote(url)
        logger.info(f"Getting neo4j-viz related pages for URL: {decoded_url}, depth: {depth}")
        
        # Access the database connection
        db_connection = graph_service.graph_operations.connection
        
        # Build relationship type filter
        rel_filter = ""
        if relationship_types:
            rel_types_str = "|".join(relationship_types)
            rel_filter = f"AND type(r) =~ '.*({rel_types_str}).*'"
        
        # Execute transaction for consistency
        async with graph_service.graph_operations.transaction() as tx:
            # Find the source page
            source_query = """
            MATCH (source:Page {url: $url})
            RETURN id(source) as source_id, source
            """
            
            source_result = await db_connection.execute_query(
                source_query,
                parameters={"url": decoded_url},
                transaction=tx
            )
            
            if not source_result:
                return GraphResponse(
                    success=False,
                    error={
                        "error_code": "PAGE_NOT_FOUND",
                        "message": f"Page not found: {decoded_url}",
                        "details": {}
                    },
                    metadata={"timestamp": datetime.now().isoformat()}
                )
            
            source_item = source_result[0]
            source_neo4j_id = source_item["source_id"]
            source_page = source_item["source"]
            
            # Generate UUID for source node
            import uuid
            source_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(source_neo4j_id)))
            
            # Get related pages
            related_query = f"""
            MATCH (source:Page {{url: $url}})-[r*1..{depth}]->(target:Page)
            WHERE target <> source {rel_filter}
            RETURN DISTINCT
                target,
                id(target) as target_id,
                r[0] as first_rel,
                length(r) as path_length
            ORDER BY path_length, target.last_active DESC
            LIMIT {limit}
            """
            
            related_result = await db_connection.execute_query(
                related_query,
                parameters={"url": decoded_url},
                transaction=tx
            )
            
            # Convert to nodes
            nodes = []
            id_mapping = {source_neo4j_id: source_uuid}
            
            # Add source node
            source_node = GraphNode(
                id=source_uuid,
                url=source_page["url"],
                title=source_page.get("title", "Untitled"),
                domain=source_page.get("domain"),
                last_active=source_page.get("last_active"),
                properties={
                    "neo4j_id": source_neo4j_id,
                    "labels": ["Page"],
                    "is_source": True
                }
            )
            nodes.append(source_node)
            
            # Add related nodes
            for item in related_result:
                target_neo4j_id = item["target_id"]
                if target_neo4j_id not in id_mapping:
                    target_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(target_neo4j_id)))
                    id_mapping[target_neo4j_id] = target_uuid
                
                target_uuid = id_mapping[target_neo4j_id]
                target_page = item["target"]
                
                node = GraphNode(
                    id=target_uuid,
                    url=target_page["url"],
                    title=target_page.get("title", "Untitled"),
                    domain=target_page.get("domain"),
                    last_active=target_page.get("last_active"),
                    properties={
                        "neo4j_id": target_neo4j_id,
                        "labels": ["Page"],
                        "path_length": item["path_length"],
                        "is_source": False
                    }
                )
                nodes.append(node)
            
            # Get relationships
            edges = []
            for item in related_result:
                target_neo4j_id = item["target_id"]
                target_uuid = id_mapping[target_neo4j_id]
                first_rel = item["first_rel"]
                
                if first_rel:
                    edge = GraphEdge(
                        source_id=source_uuid,
                        target_id=target_uuid,
                        type=first_rel.type,
                        strength=0.8,
                        metadata={
                            "neo4j_source_id": source_neo4j_id,
                            "neo4j_target_id": target_neo4j_id,
                            "path_length": item["path_length"]
                        }
                    )
                    edges.append(edge)
            
            # Create graph data response
            graph_data = GraphData(
                nodes=nodes,
                edges=edges,
                metadata={
                    "node_count": len(nodes),
                    "edge_count": len(edges),
                    "source_url": decoded_url,
                    "depth": depth,
                    "neo4j_viz_compatible": True,
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            return GraphResponse(
                success=True,
                data=graph_data,
                metadata={
                    "timestamp": datetime.now().isoformat(),
                    "neo4j_viz_version": "1.0.0"
                }
            )
            
    except Exception as e:
        logger.error(f"Error getting neo4j-viz related pages: {str(e)}", exc_info=True)
        return GraphResponse(
            success=False,
            error={
                "error_code": "NEO4J_VIZ_ERROR",
                "message": f"Failed to get related pages: {str(e)}",
                "details": {"url": url, "depth": depth}
            },
            metadata={
                "timestamp": datetime.now().isoformat()
            }
        )

@router.post("/visualize", response_model=Dict[str, Any])
async def create_neo4j_viz_visualization(
    request: Dict[str, Any],
    graph_service: GraphService = Depends(get_graph_service)
):
    """
    Create a neo4j-viz visualization with custom parameters.
    
    This endpoint creates actual neo4j-viz HTML visualizations that can be embedded directly.
    """
    try:
        logger.info("Creating neo4j-viz visualization with custom parameters")
        
        if not NEO4J_VIZ_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail={
                    "error_code": "NEO4J_VIZ_UNAVAILABLE",
                    "message": "neo4j-viz library not available",
                    "details": {}
                }
            )
        
        # Extract parameters from request
        query = request.get("query", "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100")
        layout = request.get("layout", "force-directed")
        renderer = request.get("renderer", "canvas")
        width = request.get("width", "100%")
        height = request.get("height", "600px")
        node_properties = request.get("node_properties", {})
        edge_properties = request.get("edge_properties", {})
        
        # Access the database connection
        db_connection = graph_service.graph_operations.connection
        
        # Execute the custom query and get graph result
        async with graph_service.graph_operations.transaction() as tx:
            result = await db_connection.execute_query(
                query,
                transaction=tx,
                result_transformer_=lambda records: {
                    "nodes": [record["n"] for record in records if "n" in record],
                    "relationships": [record["r"] for record in records if "r" in record]
                }
            )
            
            # Create neo4j-viz visualization
            try:
                # Convert to neo4j-viz format
                VG = from_neo4j(
                    result,
                    size_property=node_properties.get("size_property"),
                    node_caption=node_properties.get("caption", "title"),
                    relationship_caption=edge_properties.get("caption", "type"),
                    node_radius_min_max=node_properties.get("radius_range", (5, 50))
                )
                
                # Apply layout
                layout_enum = getattr(Layout, layout.upper().replace('-', '_'), Layout.FORCE_DIRECTED)
                renderer_enum = getattr(Renderer, renderer.upper(), Renderer.CANVAS)
                
                # Color nodes if specified
                if node_properties.get("color_property"):
                    if ColorSpace:
                        VG.color_nodes(
                            property=node_properties["color_property"],
                            color_space=ColorSpace.DISCRETE
                        )
                    else:
                        # Fallback if ColorSpace is not available
                        VG.color_nodes(property=node_properties["color_property"])
                
                # Render the visualization
                html_output = VG.render(
                    layout=layout_enum,
                    renderer=renderer_enum,
                    width=width,
                    height=height,
                    initial_zoom=request.get("initial_zoom", 0.5),
                    min_zoom=request.get("min_zoom", 0.1),
                    max_zoom=request.get("max_zoom", 5.0),
                    show_hover_tooltip=request.get("show_tooltips", True)
                )
                
                return {
                    "success": True,
                    "html": html_output.data if hasattr(html_output, 'data') else str(html_output),
                    "metadata": {
                        "node_count": len(VG.nodes),
                        "relationship_count": len(VG.relationships),
                        "layout": layout,
                        "renderer": renderer,
                        "timestamp": datetime.now().isoformat(),
                        "neo4j_viz_version": "1.0.0"
                    }
                }
                
            except Exception as viz_error:
                logger.error(f"Error creating neo4j-viz visualization: {str(viz_error)}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail={
                        "error_code": "NEO4J_VIZ_RENDER_ERROR",
                        "message": f"Failed to render visualization: {str(viz_error)}",
                        "details": {"query": query, "layout": layout, "renderer": renderer}
                    }
                )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating neo4j-viz visualization: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "NEO4J_VIZ_ERROR",
                "message": f"Failed to create visualization: {str(e)}",
                "details": request
            }
        )

@router.get("/html/{visualization_id}", response_model=Dict[str, Any])
async def get_neo4j_viz_html(
    visualization_id: str,
    graph_service: GraphService = Depends(get_graph_service)
):
    """
    Get a pre-rendered neo4j-viz HTML visualization by ID.
    
    This endpoint returns the HTML content of a previously created visualization.
    """
    try:
        logger.info(f"Getting neo4j-viz HTML for visualization: {visualization_id}")
        
        if not NEO4J_VIZ_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail={
                    "error_code": "NEO4J_VIZ_UNAVAILABLE",
                    "message": "neo4j-viz library not available",
                    "details": {}
                }
            )
        
        # For now, create a simple visualization based on the ID
        # In a real implementation, you'd store and retrieve visualizations
        query = "MATCH (n:Page) RETURN n LIMIT 50"
        
        # Access the database connection
        db_connection = graph_service.graph_operations.connection
        
        # Execute query and create visualization
        async with graph_service.graph_operations.transaction() as tx:
            result = await db_connection.execute_query(
                query,
                transaction=tx,
                result_transformer_=lambda records: {
                    "nodes": [record["n"] for record in records],
                    "relationships": []
                }
            )
            
            # Create neo4j-viz visualization
            VG = from_neo4j(result)
            if ColorSpace:
                VG.color_nodes(property="domain", color_space=ColorSpace.DISCRETE)
            else:
                # Fallback if ColorSpace is not available
                VG.color_nodes(property="domain")
            
            html_output = VG.render(
                layout=Layout.FORCE_DIRECTED,
                width="100%",
                height="600px",
                show_hover_tooltip=True
            )
            
            return {
                "success": True,
                "html": html_output.data if hasattr(html_output, 'data') else str(html_output),
                "visualization_id": visualization_id,
                "metadata": {
                    "node_count": len(VG.nodes),
                    "relationship_count": len(VG.relationships),
                    "timestamp": datetime.now().isoformat()
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting neo4j-viz HTML: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "NEO4J_VIZ_ERROR",
                "message": f"Failed to get visualization HTML: {str(e)}",
                "details": {"visualization_id": visualization_id}
            }
        )
