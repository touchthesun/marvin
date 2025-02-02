from typing import Optional, Any, Dict
from datetime import datetime

class GraphError(Exception):
    """Base class for graph-related errors."""
    def __init__(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        self.cause = cause
        self.timestamp = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for logging/serialization."""
        error_dict = {
            "error_type": self.__class__.__name__,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "details": self.details
        }
        if self.cause:
            error_dict["cause"] = {
                "type": self.cause.__class__.__name__,
                "message": str(self.cause)
            }
        return error_dict

class GraphQueryError(GraphError):
    """Errors during query execution."""
    def __init__(
        self,
        message: str,
        query: Optional[str] = None,
        parameters: Optional[Dict] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        if query:
            details["query"] = query
        if parameters:
            details["parameters"] = parameters
        super().__init__(message, details=details, **kwargs)

class GraphSchemaError(GraphError):
    """Errors in schema operations."""
    def __init__(
        self,
        message: str,
        schema_version: Optional[str] = None,
        operation: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        if schema_version:
            details["schema_version"] = schema_version
        if operation:
            details["operation"] = operation
        super().__init__(message, details=details, **kwargs)

class GraphTransactionError(GraphError):
    """Errors in transaction handling."""
    def __init__(
        self,
        message: str,
        transaction_id: Optional[str] = None,
        operation: Optional[str] = None,
        retry_count: Optional[int] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        if transaction_id:
            details["transaction_id"] = transaction_id
        if operation:
            details["operation"] = operation
        if retry_count is not None:
            details["retry_count"] = retry_count
        super().__init__(message, details=details, **kwargs)

class GraphValidationError(GraphError):
    """Errors in data validation."""
    def __init__(
        self,
        message: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        validation_errors: Optional[Dict] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        if entity_type:
            details["entity_type"] = entity_type
        if entity_id:
            details["entity_id"] = entity_id
        if validation_errors:
            details["validation_errors"] = validation_errors
        super().__init__(message, details=details, **kwargs)

class GraphConnectionError(GraphError):
    """Errors in Neo4j connection handling."""
    def __init__(
        self,
        message: str,
        uri: Optional[str] = None,
        connection_id: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        if uri:
            # Remove sensitive parts of URI for logging
            safe_uri = self._sanitize_uri(uri)
            details["uri"] = safe_uri
        if connection_id:
            details["connection_id"] = connection_id
        super().__init__(message, details=details, **kwargs)

    @staticmethod
    def _sanitize_uri(uri: str) -> str:
        """Remove sensitive information from Neo4j URI."""
        try:
            # Remove username/password if present
            parts = uri.split("@")
            if len(parts) > 1:
                return f"neo4j://*****@{parts[1]}"
            return uri
        except Exception:
            return "invalid_uri"

class GraphRelationshipError(GraphError):
    """Errors in relationship operations."""
    def __init__(
        self,
        message: str,
        source_id: Optional[str] = None,
        target_id: Optional[str] = None,
        relationship_type: Optional[str] = None,
        **kwargs
    ):
        details = kwargs.pop("details", {})
        if source_id:
            details["source_id"] = source_id
        if target_id:
            details["target_id"] = target_id
        if relationship_type:
            details["relationship_type"] = relationship_type
        super().__init__(message, details=details, **kwargs)