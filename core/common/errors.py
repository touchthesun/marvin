from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Set, Optional
from datetime import datetime



# Custom exceptions
class ExtractionError(Exception):
    """Base exception for extraction errors."""
    pass

class ValidationError(ExtractionError):
    """Raised when input validation fails."""
    pass

class ProcessingError(ExtractionError):
    """Raised when keyword processing fails."""
    pass

# pipeline errors
class PipelineError(Exception):
    """Base class for pipeline-specific errors."""
    pass

class StageError(PipelineError):
    """Error in pipeline stage execution."""
    pass

class ComponentError(PipelineError):
    """Error in component execution."""
    pass

class ValidationError(PipelineError):
    """Error in pipeline validation."""
    pass

class TimeoutError(PipelineError):
    """Pipeline timeout error."""
    pass

class DatabaseError(Exception):
    """Exception raised for database-related errors.
    
    Attributes:
        message: Error message
        query: Optional query that caused the error
        parameters: Optional query parameters
        details: Optional additional error details
        cause: Optional underlying exception
    """
    
    def __init__(
        self,
        message: str,
        query: Optional[str] = None,
        parameters: Optional[Dict] = None,
        details: Optional[Dict] = None,
        cause: Optional[Exception] = None
    ):
        self.message = message
        self.query = query
        self.parameters = parameters
        self.details = details or {}
        self.cause = cause
        super().__init__(self.message)
    
    def __str__(self) -> str:
        error_parts = [self.message]
        if self.details:
            error_parts.append(f"Details: {self.details}")
        if self.cause:
            error_parts.append(f"Caused by: {str(self.cause)}")
        return " ".join(error_parts)
    
    
class QueryTimeoutError(DatabaseError):
    """Raised when query execution times out."""
    pass

class QueryExecutionError(DatabaseError):
    """Raised when query execution fails."""
    pass

class InvalidTransactionError(DatabaseError):
    """Raised when transaction validation fails."""
    pass


# Service Errors
class ServiceError(Exception):
    """Base exception for service layer errors.
    
    Attributes:
        message: Human-readable error description
        details: Additional error context as a dictionary
        cause: Original exception that caused this error
    """
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

    def __str__(self) -> str:
        error_str = self.message
        if self.details:
            error_str += f" Details: {self.details}"
        if self.cause:
            error_str += f" Caused by: {str(self.cause)}"
        return error_str
    

class SchemaError(Exception):
    """Exception for schema-related operations.
    
    Attributes:
        message: Human-readable error description
        operation: Name of the schema operation that failed
        details: Additional error context as a dictionary
        cause: Original exception that caused this error
    """
    def __init__(
        self,
        message: str,
        operation: str,
        details: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        self.message = message
        self.operation = operation
        self.details = details or {}
        self.cause = cause

    def __str__(self) -> str:
        error_str = f"{self.message} (operation: {self.operation})"
        if self.details:
            error_str += f" Details: {self.details}"
        if self.cause:
            error_str += f" Caused by: {str(self.cause)}"
        return error_str
    
    