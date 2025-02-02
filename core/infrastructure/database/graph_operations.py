import neo4j

from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from core.utils.logger import get_logger
from core.infrastructure.database.db_connection import DatabaseConnection


@dataclass
class Node:
    """Node data structure."""
    id: str
    labels: List[str]
    properties: Dict

@dataclass
class Relationship:
    """Relationship data structure."""
    id: str
    type: str
    start_node: Node
    end_node: Node
    properties: Dict

class GraphOperationError(Exception):
    """Base exception for graph operations."""
    def __init__(
        self,
        message: str,
        operation: str,
        details: Optional[Dict] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        self.operation = operation
        self.details = details or {}
        self.cause = cause

class GraphOperationManager:
    """Manages graph-specific operations."""
    
    def __init__(self, connection: DatabaseConnection):
        self.connection = connection
        self.logger = get_logger(__name__)

    @property
    def transaction(self):
        """Access to database transaction context manager."""
        return self.connection.transaction
        
    async def create_node(
        self,
        labels: List[str],
        properties: Dict,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> Node:
        """Create a node with labels and properties."""
        try:
            # Prepare labels string
            labels_str = ':'.join(labels)
            
            query = f"""
            CREATE (n:{labels_str})
            SET n = $properties
            RETURN n, id(n) as node_id, labels(n) as node_labels
            """
            
            result = await self.connection.execute_query(
                query,
                parameters={"properties": properties},
                transaction=transaction
            )
            
            if not result:
                raise GraphOperationError(
                    message="Node creation returned no result",
                    operation="create_node",
                    details={"labels": labels, "properties": properties}
                )
                
            node_data = result[0]
            return Node(
                id=str(node_data["node_id"]),
                labels=node_data["node_labels"],
                properties=dict(node_data["n"])
            )
            
        except Exception as e:
            self.logger.error(f"Error creating node: {str(e)}")
            raise GraphOperationError(
                message="Failed to create node",
                operation="create_node",
                details={"labels": labels, "properties": properties},
                cause=e
            )
        
    async def get_node_by_id(
        self,
        node_id: str,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> Optional[Node]:
        """Retrieve a node by ID."""
        try:
            query = """
            MATCH (n)
            WHERE id(n) = $node_id
            RETURN n, id(n) as node_id, labels(n) as node_labels
            """
            
            result = await self.connection.execute_read_query(
                query,
                parameters={"node_id": int(node_id)},
                transaction=transaction
            )
            
            if not result:
                return None
                
            node_data = result[0]
            return Node(
                id=str(node_data["node_id"]),
                labels=node_data["node_labels"],
                properties=dict(node_data["n"])
            )
            
        except Exception as e:
            self.logger.error(f"Error getting node {node_id}: {str(e)}")
            raise GraphOperationError(
                message="Failed to get node",
                operation="get_node_by_id",
                details={"node_id": node_id},
                cause=e
            )

    async def get_node_by_property(
        self,
        label: str,
        property_name: str,
        property_value: Any,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> Optional[Node]:
        """Retrieve a node by property value."""
        try:
            query = f"""
            MATCH (n:{label})
            WHERE n.{property_name} = $property_value
            RETURN n, id(n) as node_id, labels(n) as node_labels
            """
            
            result = await self.connection.execute_read_query(
                query,
                parameters={"property_value": property_value},
                transaction=transaction
            )
            
            if not result:
                return None
                
            node_data = result[0]
            return Node(
                id=str(node_data["node_id"]),
                labels=node_data["node_labels"],
                properties=dict(node_data["n"])
            )
            
        except Exception as e:
            self.logger.error(
                f"Error getting node by property {property_name}: {str(e)}"
            )
            raise GraphOperationError(
                message="Failed to get node by property",
                operation="get_node_by_property",
                details={
                    "label": label,
                    "property_name": property_name,
                    "property_value": property_value
                },
                cause=e
            )

    async def create_relationship(
        self,
        start_node_id: str,
        end_node_id: str,
        relationship_type: str,
        properties: Dict,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> Relationship:
        """Create a relationship between nodes."""
        try:
            query = f"""
            MATCH (start), (end)
            WHERE id(start) = $start_id AND id(end) = $end_id
            CREATE (start)-[r:{relationship_type}]->(end)
            SET r = $properties
            RETURN r, id(r) as rel_id,
                   start, id(start) as start_id, labels(start) as start_labels,
                   end, id(end) as end_id, labels(end) as end_labels
            """
            
            result = await self.connection.execute_query(
                query,
                parameters={
                    "start_id": int(start_node_id),
                    "end_id": int(end_node_id),
                    "properties": properties
                },
                transaction=transaction
            )
            
            if not result:
                raise GraphOperationError(
                    message="Relationship creation returned no result",
                    operation="create_relationship",
                    details={
                        "start_node_id": start_node_id,
                        "end_node_id": end_node_id,
                        "type": relationship_type
                    }
                )
                
            rel_data = result[0]
            return Relationship(
                id=str(rel_data["rel_id"]),
                type=relationship_type,
                start_node=Node(
                    id=str(rel_data["start_id"]),
                    labels=rel_data["start_labels"],
                    properties=dict(rel_data["start"])
                ),
                end_node=Node(
                    id=str(rel_data["end_id"]),
                    labels=rel_data["end_labels"],
                    properties=dict(rel_data["end"])
                ),
                properties=dict(rel_data["r"])
            )
            
        except Exception as e:
            self.logger.error(f"Error creating relationship: {str(e)}")
            raise GraphOperationError(
                message="Failed to create relationship",
                operation="create_relationship",
                details={
                    "start_node_id": start_node_id,
                    "end_node_id": end_node_id,
                    "type": relationship_type
                },
                cause=e
            )
        
    async def find_related_nodes(
        self,
        start_node_id: str,
        relationship_types: Optional[List[str]] = None,
        min_score: float = 0.0,
        limit: int = 10,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> List[Dict]:
        """Find nodes related to start node with relevance scoring.
        
        Args:
            start_node_id: ID of the starting node
            relationship_types: Optional list of relationship types to traverse
            min_score: Minimum relationship score to include
            limit: Maximum number of results to return
            transaction: Optional existing transaction
            
        Returns:
            List of dicts containing related nodes and relationship info
        """
        try:
            # Build relationship type filter
            rel_filter = ""
            if relationship_types:
                rel_types = '|'.join(f':{t}' for t in relationship_types)
                rel_filter = f"[{rel_types}]"
            
            query = f"""
            MATCH (start)-[r{rel_filter}]->(related)
            WHERE id(start) = $start_id
            AND r.score >= $min_score
            WITH related, r, r.score as score
            ORDER BY score DESC
            LIMIT $limit
            RETURN 
                related,
                id(related) as node_id,
                labels(related) as node_labels,
                type(r) as relationship_type,
                r.score as score,
                properties(r) as rel_properties
            """
            
            result = await self.connection.execute_read_query(
                query,
                parameters={
                    "start_id": int(start_node_id),
                    "min_score": min_score,
                    "limit": limit
                },
                transaction=transaction
            )
            
            return [{
                "node": Node(
                    id=str(item["node_id"]),
                    labels=item["node_labels"],
                    properties=dict(item["related"])
                ),
                "type": item["relationship_type"],
                "score": item["score"],
                "metadata": item["rel_properties"]
            } for item in result]
            
        except Exception as e:
            self.logger.error(f"Error finding related nodes: {str(e)}")
            raise GraphOperationError(
                message="Failed to find related nodes",
                operation="find_related_nodes",
                details={
                    "start_node_id": start_node_id,
                    "relationship_types": relationship_types,
                    "min_score": min_score
                },
                cause=e
            )

    async def create_or_update_node(
        self,
        labels: List[str],
        properties: Dict,
        match_properties: Optional[List[str]] = None,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> Node:
        """Create a node or update if it exists based on matching properties.
        
        Args:
            labels: Node labels
            properties: Node properties
            match_properties: Properties to match for existing nodes
            transaction: Optional existing transaction
        
        Returns:
            Created or updated node
        """
        try:
            labels_str = ':'.join(labels)
            match_properties = match_properties or []
            
            # Build MERGE matching criteria
            match_clause = ""
            if match_properties:
                criteria = [
                    f"n.{prop} = ${prop}"
                    for prop in match_properties
                    if prop in properties
                ]
                if criteria:
                    match_clause = f"WHERE {' AND '.join(criteria)}"
            
            query = f"""
            MERGE (n:{labels_str} {match_clause})
            SET n = $properties
            RETURN n, id(n) as node_id, labels(n) as node_labels
            """
            
            result = await self.connection.execute_query(
                query,
                parameters={
                    "properties": properties,
                    **{prop: properties[prop] for prop in match_properties if prop in properties}
                },
                transaction=transaction
            )
            
            if not result:
                raise GraphOperationError(
                    message="Node creation/update returned no result",
                    operation="create_or_update_node",
                    details={"labels": labels, "properties": properties}
                )
            
            node_data = result[0]
            return Node(
                id=str(node_data["node_id"]),
                labels=node_data["node_labels"],
                properties=dict(node_data["n"])
            )
            
        except Exception as e:
            self.logger.error(f"Error creating/updating node: {str(e)}")
            raise GraphOperationError(
                message="Failed to create/update node",
                operation="create_or_update_node",
                details={"labels": labels, "properties": properties},
                cause=e
            )

    async def batch_create_relationships(
        self,
        relationships: List[Dict[str, Any]],
        transaction: Optional[neo4j.AsyncTransaction] = None,
        batch_size: int = 1000
    ) -> List[Relationship]:
        """Create multiple relationships in batches.
        
        Args:
            relationships: List of relationship data dicts containing:
                - start_node_id
                - end_node_id
                - type
                - properties
            transaction: Optional existing transaction
            batch_size: Number of relationships to create in each batch
            
        Returns:
            List of created relationships
        """
        try:
            results = []
            
            # Process in batches
            for i in range(0, len(relationships), batch_size):
                batch = relationships[i:i + batch_size]
                
                query = """
                UNWIND $relationships as rel
                MATCH (start), (end)
                WHERE id(start) = rel.start_node_id AND id(end) = rel.end_node_id
                CREATE (start)-[r:rel.type]->(end)
                SET r = rel.properties
                RETURN r, id(r) as rel_id,
                       start, id(start) as start_id, labels(start) as start_labels,
                       end, id(end) as end_id, labels(end) as end_labels
                """
                
                batch_results = await self.connection.execute_query(
                    query,
                    parameters={"relationships": [{
                        "start_node_id": int(rel["start_node_id"]),
                        "end_node_id": int(rel["end_node_id"]),
                        "type": rel["type"],
                        "properties": rel["properties"]
                    } for rel in batch]},
                    transaction=transaction
                )
                
                for rel_data in batch_results:
                    results.append(Relationship(
                        id=str(rel_data["rel_id"]),
                        type=rel_data["type"],
                        start_node=Node(
                            id=str(rel_data["start_id"]),
                            labels=rel_data["start_labels"],
                            properties=dict(rel_data["start"])
                        ),
                        end_node=Node(
                            id=str(rel_data["end_id"]),
                            labels=rel_data["end_labels"],
                            properties=dict(rel_data["end"])
                        ),
                        properties=dict(rel_data["r"])
                    ))
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error in batch relationship creation: {str(e)}")
            raise GraphOperationError(
                message="Failed to create relationships in batch",
                operation="batch_create_relationships",
                details={"batch_size": batch_size, "total_count": len(relationships)},
                cause=e
            )