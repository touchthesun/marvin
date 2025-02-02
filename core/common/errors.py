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

# DB errors
class DatabaseError(Exception):
    """Base exception for database operations."""
    def __init__(
        self,
        message: str,
        query: Optional[str] = None,
        parameters: Optional[Dict] = None,
        cause: Optional[Exception] = None
    ):
        super().__init__(message)
        self.query = query
        self.parameters = parameters
        self.cause = cause


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