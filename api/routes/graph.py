from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from core.services.graph.graph_service import GraphService
from api.dependencies import get_graph_service
from api.models.response import GraphResponse
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/graph", tags=["graph"])

@router.get("/related/{url}", response_model=GraphResponse)
async def get_related_pages(
    url: str,
    depth: int = Query(default=1, ge=1, le=3),
    relationship_types: Optional[List[str]] = Query(default=None),
    graph_service: GraphService = Depends(get_graph_service)
):
    """Get pages related to the given URL."""
    try:
        results = await graph_service.get_related_pages(
            url=url,
            relationship_types=relationship_types,
            min_strength=0.0,
            limit=10 * depth  # Consider moving to configuration
        )
        
        nodes = []
        relationships = []
        seen_nodes = set()
        
        for result in results:
            page = result["page"]
            if page["url"] not in seen_nodes:
                nodes.append(page)
                seen_nodes.add(page["url"])
            relationships.append(result["relationship"])
        
        return GraphResponse(
            success=True,
            nodes=nodes,
            relationships=relationships
        )
    except Exception as e:
        logger.error(f"Error getting related pages: {str(e)}", exc_info=True)
        raise

@router.get("/search", response_model=GraphResponse)
async def search_graph(
    query: str,
    limit: int = 100,
    graph_service = Depends(get_graph_service)
):
    results = await graph_service.search_pages(
        url_pattern=query,
        limit=limit
    )
    
    return GraphResponse(
        success=True,
        nodes=results,
        relationships=[]
    )