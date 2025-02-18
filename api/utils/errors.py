from typing import Optional, Dict, Any
from fastapi import HTTPException
from starlette.status import (
    HTTP_422_UNPROCESSABLE_ENTITY,
    HTTP_404_NOT_FOUND,
    HTTP_400_BAD_REQUEST
)

class APIError(HTTPException):
    """Base API error class."""
    def __init__(
        self,
        status_code: int,
        message: str,
        error_code: str,
        details: Optional[Dict[str, Any]] = None
    ):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        super().__init__(status_code=status_code, detail=self.to_dict())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_code": self.error_code,
            "message": self.message,
            "details": self.details
        }

class ValidationError(APIError):
    """Validation error."""
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            status_code=HTTP_422_UNPROCESSABLE_ENTITY,
            message=message,
            error_code="VALIDATION_ERROR",
            details=details
        )

class NotFoundError(APIError):
    """Resource not found error."""
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            status_code=HTTP_404_NOT_FOUND,
            message=f"{resource} not found: {identifier}",
            error_code="NOT_FOUND",
            details={"resource": resource, "identifier": identifier}
        )

class BadRequestError(APIError):
    """Bad request error."""
    def __init__(self, message: str, details: Optional[Dict] = None):
        super().__init__(
            status_code=HTTP_400_BAD_REQUEST,
            message=message,
            error_code="BAD_REQUEST",
            details=details
        )