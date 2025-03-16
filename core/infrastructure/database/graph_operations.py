import neo4j
import time
import uuid
import traceback
import statistics
from enum import Enum, auto
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from core.utils.logger import get_logger
from core.infrastructure.database.db_connection import DatabaseConnection


logger = get_logger(__name__)

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

class RelationshipType(Enum):
    """Enum defining Neo4j relationship types."""
    HAS_KEYWORD = "HAS_KEYWORD"
    LINKS_TO = "LINKS_TO"
    SIMILAR_TO = "SIMILAR_TO"
    REFERENCES = "REFERENCES"
    
    def __str__(self):
        """Return the string value of the enum."""
        return self.value

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
    """Manages graph-specific operations with comprehensive logging."""
    
    def __init__(self, connection: DatabaseConnection):
        self.connection = connection
        self.logger = get_logger(__name__)
        self.logger.info("Initializing GraphOperationsManager")

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
        operation_id = str(uuid.uuid4())[:8]
        self.logger.info(
            f"[{operation_id}] Creating node",
            extra={
                "labels": labels,
                "property_keys": list(properties.keys()),
                "transaction_exists": bool(transaction)
            }
        )
        
        try:
            labels_str = ':'.join(labels)
            start_time = time.time()
            
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
                self.logger.error(
                    f"[{operation_id}] Node creation returned no result",
                    extra={"labels": labels, "duration": time.time() - start_time}
                )
                raise GraphOperationError(
                    message="Node creation returned no result",
                    operation="create_node",
                    details={"labels": labels}
                )
                
            node_data = result[0]
            node = Node(
                id=str(node_data["node_id"]),
                labels=node_data["node_labels"],
                properties=dict(node_data["n"])
            )
            
            self.logger.info(
                f"[{operation_id}] Successfully created node",
                extra={
                    "node_id": node.id,
                    "labels": node.labels,
                    "duration": time.time() - start_time
                }
            )
            return node
            
        except Exception as e:
            self.logger.error(
                f"[{operation_id}] Failed to create node",
                extra={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "labels": labels,
                    "stack_trace": traceback.format_exc()
                }
            )
            raise GraphOperationError(
                message="Failed to create node",
                operation="create_node",
                details={"labels": labels},
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
        operation_id = str(uuid.uuid4())[:8]
        self.logger.info(
            f"[{operation_id}] Finding related nodes",
            extra={
                "start_node": start_node_id,
                "rel_types": relationship_types,
                "min_score": min_score,
                "limit": limit
            }
        )
        
        try:
            start_time = time.time()
            rel_filter = ""
            if relationship_types:
                rel_types = '|'.join(f':{t}' for t in relationship_types)
                rel_filter = f"[{rel_types}]"
                self.logger.debug(
                    f"[{operation_id}] Using relationship filter: {rel_filter}"
                )
            
            query = f"""
            MATCH (start)-[r{rel_filter}]->(related)
            WHERE elementId(start) = $start_id
            AND r.score >= $min_score
            WITH related, r, r.score as score
            ORDER BY score DESC
            LIMIT $limit
            RETURN 
                related,
                elementId(related) as node_id,
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
            
            related_nodes = [{
                "node": Node(
                    id=str(item["node_id"]),
                    labels=item["node_labels"],
                    properties=dict(item["related"])
                ),
                "type": item["relationship_type"],
                "score": item["score"],
                "metadata": item["rel_properties"]
            } for item in result]
            
            duration = time.time() - start_time
            self.logger.info(
                f"[{operation_id}] Found related nodes",
                extra={
                    "node_count": len(related_nodes),
                    "duration": duration,
                    "avg_score": statistics.mean([n["score"] for n in related_nodes]) if related_nodes else 0
                }
            )
            
            return related_nodes
            
        except Exception as e:
            self.logger.error(
                f"[{operation_id}] Failed to find related nodes",
                extra={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "start_node": start_node_id,
                    "stack_trace": traceback.format_exc()
                }
            )
            raise GraphOperationError(
                message="Failed to find related nodes",
                operation="find_related_nodes", 
                details={
                    "start_node_id": start_node_id,
                    "relationship_types": relationship_types
                },
                cause=e
            )
        
    
    async def query_nodes(
        self,
        label: str,
        conditions: Optional[Dict[str, Any]] = None,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> List[Node]:
        """Query nodes based on label and conditions.
        
        Args:
            label: Node label to match
            conditions: Optional dictionary of property conditions
            transaction: Optional existing transaction
            
        Returns:
            List of matching nodes
        """
        try:
            # Build WHERE clause from conditions
            where_clauses = []
            parameters = {}
            
            if conditions:
                for key, value in conditions.items():
                    if value is not None:
                        where_clauses.append(f"n.{key} = ${key}")
                        parameters[key] = value
            
            # Construct query
            query = f"MATCH (n:{label})"
            if where_clauses:
                query += f" WHERE {' AND '.join(where_clauses)}"
            query += " RETURN n, id(n) as node_id, labels(n) as node_labels"
            
            # Execute query
            result = await self.connection.execute_query(
                query,
                parameters=parameters,
                transaction=transaction
            )
            
            # Convert results to Node objects
            nodes = []
            for record in result:
                node = Node(
                    id=str(record["node_id"]),
                    labels=record["node_labels"],
                    properties=dict(record["n"])
                )
                nodes.append(node)
                
            return nodes
            
        except Exception as e:
            self.logger.error(f"Error querying nodes: {str(e)}")
            raise GraphOperationError(
                message="Failed to query nodes",
                operation="query_nodes",
                details={
                    "label": label,
                    "conditions": conditions
                },
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
            WHERE elementId(n) = $node_id
            RETURN n, elementId(n) as node_id, labels(n) as node_labels
            """
            
            result = await self.connection.execute_read_query(
                query,
                parameters={"node_id": node_id},
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
        operation_id = str(uuid.uuid4())[:8]
        timings = {}
        query_start = time.time()
        
        # 1. Property validation logging
        self.logger.debug(
            f"[{operation_id}] Validating relationship properties",
            extra={
                "property_count": len(properties),
                "property_types": {k: type(v).__name__ for k, v in properties.items()},
                "required_properties": ["score", "weight"],
                "has_required": all(key in properties for key in ["score", "weight"])
            }
        )

        # 2. Connection pool status
        pool_status = await self.connection.check_connection_pool()
        self.logger.debug(
            f"[{operation_id}] Connection pool status",
            extra={
                "pool_status": pool_status,
                "operation": "create_relationship"
            }
        )
 
        # 3. Relationship property details
        property_metrics = {
            "numeric_props": len([v for v in properties.values() if isinstance(v, (int, float))]),
            "string_props": len([v for v in properties.values() if isinstance(v, str)]),
            "array_props": len([v for v in properties.values() if isinstance(v, (list, tuple))]),
            "total_props": len(properties),
            "property_sizes": {k: len(str(v)) for k, v in properties.items()}
        }

        # 4. Transaction state logging
        tx_state = {
            "has_transaction": transaction is not None,
            "tx_id": getattr(transaction, "id", None),
            "tx_status": getattr(transaction, "status", "no_transaction"),
            "is_managed": bool(getattr(transaction, "_managed", False))
        }
        
        self.logger.debug(
            f"[{operation_id}] Transaction state",
            extra={
                "transaction": tx_state,
                "operation": "create_relationship"
            }
        )
        
        # Time the query execution
        query_exec_start = time.time()
        result = await self.connection.execute_query(
            query,
            parameters={
                "start_id": int(start_node_id),
                "end_id": int(end_node_id),
                "properties": properties
            },
            transaction=transaction
        )
        timings['query_execution'] = time.time() - query_exec_start
        
        if not result:
            timings['total_operation'] = time.time() - query_start
            self.logger.error(
                f"[{operation_id}] Relationship creation returned no result",
                extra={"timings": timings}
            )
            raise GraphOperationError(...)

        self.logger.info(
            f"[{operation_id}] Relationship property metrics",
            extra={
                "metrics": property_metrics,
                "relationship_type": relationship_type
            }
        )

        # Track operation metrics
        metrics = {
            "operation": "create_relationship",
            "attempts": 1,
            "property_count": len(properties),
            "start_time": query_start,
            "success": False
        }

        try:
                query = f"""
                MATCH (start), (end)
                WHERE elementId(start) = $start_id AND elementId(end) = $end_id
                CREATE (start)-[r:{relationship_type}]->(end)
                SET r = $properties
                RETURN r, elementId(r) as rel_id,
                    start, elementId(start) as start_id, labels(start) as start_labels,
                    end, elementId(end) as end_id, labels(end) as end_labels
                """

                # Validate node labels before relationship creation
                start_node_labels = await self._get_node_labels(start_node_id, transaction)
                end_node_labels = await self._get_node_labels(end_node_id, transaction)
                
                self.logger.debug(
                    f"[{operation_id}] Validating node labels for relationship",
                    extra={
                        "start_node": {
                            "id": start_node_id,
                            "labels": start_node_labels
                        },
                        "end_node": {
                            "id": end_node_id,
                            "labels": end_node_labels
                        },
                        "relationship_type": relationship_type,
                        "valid_combination": self._validate_label_combination(
                            start_node_labels, 
                            end_node_labels, 
                            relationship_type
                        )
                    }
                )

                
                # Time the query execution
                query_exec_start = time.time()
                result = await self.connection.execute_query(
                    query,
                    parameters={
                        "start_id": int(start_node_id),
                        "end_id": int(end_node_id),
                        "properties": properties
                    },
                    transaction=transaction
                )
                timings['query_execution'] = time.time() - query_exec_start
                
                if not result:
                    timings['total_operation'] = time.time() - query_start
                    self.logger.error(
                        f"[{operation_id}] Relationship creation returned no result",
                        extra={"timings": timings}
                    )
                    raise GraphOperationError(...)
                    
                # Time the result processing
                processing_start = time.time()
                rel_data = result[0]
                relationship = Relationship(
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
                timings['result_processing'] = time.time() - processing_start
                timings['total_operation'] = time.time() - query_start
                
                # Update success metrics before return
                metrics.update({
                    "success": True,
                    "duration": timings['total_operation'],
                    "relationship_created": True,
                    "nodes_found": 2,
                    "properties_set": len(properties)
                })
                
                self.logger.info(
                    f"[{operation_id}] Operation metrics",
                    extra={"metrics": metrics}
                )
                
                return relationship
                
        except Exception as e:
            # Update failure metrics
            metrics.update({
                "success": False,
                "duration": time.time() - query_start,
                "error_type": type(e).__name__,
                "failure_stage": "query_execution" if "query_execution" not in timings else "result_processing"
            })
            
            self.logger.error(
                f"[{operation_id}] Operation failed",
                extra={"metrics": metrics}
            )
            raise


    async def _get_node_labels(self, node_id: str, transaction: Optional[neo4j.AsyncTransaction] = None) -> List[str]:
        """Get labels for a node by ID."""
        result = await self.connection.execute_query(
            "MATCH (n) WHERE elementId(n) = $node_id RETURN labels(n) as labels",
            parameters={"node_id": node_id},
            transaction=transaction
        )
        return result[0]["labels"] if result else []

    async def find_related_nodes(
        self,
        start_node_id: str,
        relationship_types: Optional[List[str]] = None,
        min_score: float = 0.0,
        limit: int = 10,
        transaction: Optional[neo4j.AsyncTransaction] = None
    ) -> List[Dict]:
        operation_id = str(uuid.uuid4())[:8]
        self.logger.info(
            f"[{operation_id}] Finding related nodes",
            extra={
                "start_node": start_node_id,
                "rel_types": relationship_types,
                "min_score": min_score,
                "limit": limit
            }
        )

        try:
            start_time = time.time()
            rel_filter = ""
            if relationship_types:
                rel_types = '|'.join(f':{t}' for t in relationship_types)
                rel_filter = f"[{rel_types}]"
                self.logger.debug(
                    f"[{operation_id}] Using relationship filter: {rel_filter}"
                )

            query = f"""
            MATCH (start)-[r{rel_filter}]->(related)
            WHERE elementId(start) = $start_id
            AND r.score >= $min_score
            WITH related, r, r.score as score
            ORDER BY score DESC
            LIMIT $limit
            RETURN 
                related,
                elementId(related) as node_id,
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

            related_nodes = [{
                "node": Node(
                    id=str(item["node_id"]),
                    labels=item["node_labels"],
                    properties=dict(item["related"])
                ),
                "type": item["relationship_type"],
                "score": item["score"],
                "metadata": item["rel_properties"]
            } for item in result]

            duration = time.time() - start_time
            self.logger.info(
                f"[{operation_id}] Found related nodes",
                extra={
                    "node_count": len(related_nodes),
                    "duration": duration,
                    "avg_score": statistics.mean([n["score"] for n in related_nodes]) if related_nodes else 0
                }
            )

            return related_nodes

        except Exception as e:
            self.logger.error(
                f"[{operation_id}] Failed to find related nodes",
                extra={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "start_node": start_node_id,
                    "stack_trace": traceback.format_exc()
                }
            )
            raise GraphOperationError(
                message="Failed to find related nodes",
                operation="find_related_nodes", 
                details={
                    "start_node_id": start_node_id,
                    "relationship_types": relationship_types
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
            
            # Build match criteria for MERGE
            match_dict = {
                prop: properties[prop]
                for prop in match_properties
                if prop in properties
            }
            
            # Build MERGE pattern with properties in the node pattern
            if match_dict:
                match_pattern = "{"
                match_pattern += ", ".join(f"{k}: ${k}" for k in match_dict.keys())
                match_pattern += "}"
                query = f"""
                MERGE (n:{labels_str} {match_pattern})
                SET n = $all_properties
                RETURN n, id(n) as node_id, labels(n) as node_labels
                """
                parameters = {
                    **match_dict,
                    "all_properties": properties
                }
            else:
                # If no match properties, create new node
                query = f"""
                CREATE (n:{labels_str})
                SET n = $properties
                RETURN n, id(n) as node_id, labels(n) as node_labels
                """
                parameters = {"properties": properties}
            
            result = await self.connection.execute_query(
                query,
                parameters=parameters,
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
        batch_size: int = 100
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
                WHERE elementId(start) = rel.start_node_id AND id(end) = rel.end_node_id
                CALL apoc.create.relationship(start, rel.type, rel.properties, end) YIELD rel as r
                RETURN r, elementId(r) as rel_id,
                    start, elementId(start) as start_id, labels(start) as start_labels,
                    end, elementId(end) as end_id, labels(end) as end_labels
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
            if "timeout" in str(e).lower():
                self.logger.error(f"Query timeout in batch relationship creation: {str(e)}")
            raise GraphOperationError(
                message="Failed to create relationships in batch",
                operation="batch_create_relationships",
                details={"batch_size": batch_size, "total_count": len(relationships)},
                cause=e
            )