from fastapi import APIRouter, Depends, Query
from datetime import datetime
from typing import List, Optional

from core.services.content.page_service import PageService
from core.infrastructure.database.transactions import Transaction
from api.dependencies import get_page_service
from api.models.stats.response import StatsData, StatsResponse
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("/", response_model=StatsResponse)
async def get_stats(
    start_date: Optional[datetime] = Query(
        None, 
        description="Start date for filtering stats (ISO format: YYYY-MM-DDTHH:MM:SS)",
        example="2023-01-01T00:00:00"
    ),
    end_date: Optional[datetime] = Query(
        None,
        description="End date for filtering stats (ISO format: YYYY-MM-DDTHH:MM:SS)",
        example="2023-12-31T23:59:59"
    ),
    include_types: Optional[List[str]] = Query(
        None,
        description="Types of stats to include",
        example=["captures", "relationships", "queries"]
    ),
    detailed: bool = Query(
        False,
        description="Whether to include detailed statistics"
    ),
    page_service: PageService = Depends(get_page_service)
):
    """Get system statistics."""
    tx = Transaction()
    try:
        # Access the connection through the graph operations
        db_connection = page_service.graph_service.graph_operations.connection
        
        # Build date filter parameters
        params = {}
        if start_date:
            params["start_date"] = start_date.isoformat()
        if end_date:
            params["end_date"] = end_date.isoformat()
        
        # Get page count (captures)
        captures_query = "MATCH (p:Page) "
        if start_date or end_date:
            captures_query += "WHERE "
            if start_date:
                captures_query += "p.discovered_at >= $start_date "
            if start_date and end_date:
                captures_query += "AND "
            if end_date:
                captures_query += "p.discovered_at <= $end_date "
        captures_query += "RETURN count(p) as count"
        
        captures_result = await db_connection.execute_query(
            captures_query,
            parameters=params,
            transaction=tx
        )
        captures = captures_result[0]["count"] if captures_result else 0
        
        # Get relationship count - no date filtering for now
        relationships_query = "MATCH ()-[r]->() RETURN count(r) as count"
        relationships_result = await db_connection.execute_query(
            relationships_query,
            transaction=tx
        )
        relationships = relationships_result[0]["count"] if relationships_result else 0
        
        # Get query count from Tasks with proper WHERE clause
        queries_query = "MATCH (t:Task) WHERE t.type = 'QUERY' "
        if start_date:
            queries_query += "AND t.discovered_at >= $start_date "
        if end_date:
            queries_query += "AND t.discovered_at <= $end_date "
        queries_query += "RETURN count(t) as count"
        
        queries_result = await db_connection.execute_query(
            queries_query,
            parameters=params,
            transaction=tx
        )
        queries = queries_result[0]["count"] if queries_result else 0
        
        # Prepare details if requested
        details = None
        if detailed:
            details = await get_detailed_stats(db_connection, tx, start_date, end_date, params)
        
        # Commit transaction
        await tx.commit()
        
        # Create response with all collected data
        stats_data = StatsData(
            captures=captures,
            relationships=relationships,
            queries=queries,
            last_updated=datetime.now().isoformat(),
            details=details
        )
        
        return StatsResponse(
            success=True,
            data=stats_data,
            error=None,
            metadata={"timestamp": datetime.now().isoformat()}
        )
    except Exception as e:
        # Ensure rollback on any error
        await tx.rollback()
        logger.error(f"Error getting stats: {str(e)}", exc_info=True)
        raise

async def get_detailed_stats(db_connection, tx, start_date=None, end_date=None, params=None):
    """Get detailed statistics."""
    details = {}
    params = params or {}
    
    # Pages by domain with proper WHERE clauses
    domains_query = "MATCH (p:Page) "
    if start_date or end_date:
        domains_query += "WHERE "
        if start_date:
            domains_query += "p.discovered_at >= $start_date "
        if start_date and end_date:
            domains_query += "AND "
        if end_date:
            domains_query += "p.discovered_at <= $end_date "
    domains_query += "RETURN p.domain as domain, count(p) as count ORDER BY count DESC LIMIT 10"
    
    domains_result = await db_connection.execute_query(
        domains_query,
        parameters=params,
        transaction=tx
    )
    details["top_domains"] = [
        {"domain": item["domain"], "count": item["count"]} 
        for item in domains_result
    ]
    
    # Pages by context with proper WHERE clauses
    contexts_query = "MATCH (p:Page) "
    if start_date or end_date:
        contexts_query += "WHERE "
        if start_date:
            contexts_query += "p.discovered_at >= $start_date "
        if start_date and end_date:
            contexts_query += "AND "
        if end_date:
            contexts_query += "p.discovered_at <= $end_date "
    contexts_query += "UNWIND p.browser_contexts as context RETURN context, count(p) as count"
    
    contexts_result = await db_connection.execute_query(
        contexts_query,
        parameters=params,
        transaction=tx
    )
    details["context_distribution"] = [
        {"context": item["context"], "count": item["count"]} 
        for item in contexts_result
    ]
    
    # Relationship types - no date filtering
    relationship_types_result = await db_connection.execute_query(
        "MATCH ()-[r]->() RETURN type(r) as type, count(r) as count ORDER BY count DESC",
        transaction=tx
    )
    details["relationship_types"] = [
        {"type": item["type"], "count": item["count"]} 
        for item in relationship_types_result
    ]
    
    return details