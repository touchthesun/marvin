from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from api.dependencies import get_graph_service
from api.models.response import GraphResponse

router = APIRouter(prefix="/graph", tags=["graph"])

@router.get("/related/{url}", response_model=GraphResponse)
async def get_related_pages(
    url: str,
    depth: int = 1,
    relationship_types: List[str] = None,
    graph_service = Depends(get_graph_service)
):
    results = await graph_service.get_related_pages(
        url=url,
        relationship_types=relationship_types,
        min_strength=0.0,
        limit=10 * depth
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