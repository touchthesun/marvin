from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable
import time
import json
from uuid import uuid
from datetime import datetime
from api.utils.errors import APIError
from api.models.common import APIResponse
from core.utils.logger import get_logger

logger = get_logger(__name__)

class RequestValidationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            response = await call_next(request)
            return response
        except ValueError as e:
            return JSONResponse(
                status_code=422,
                content=APIResponse(
                    success=False,
                    error={
                        "error_code": "VALIDATION_ERROR",
                        "message": str(e),
                        "details": {"type": "ValueError"}
                    }
                ).model_dump()
            )

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests = {}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host
        now = datetime.now().timestamp()

        # Clean old requests
        self.requests = {ip: times for ip, times in self.requests.items()
                        if times[-1] > now - 60}

        # Check rate limit
        if client_ip in self.requests:
            if len(self.requests[client_ip]) >= self.requests_per_minute:
                return JSONResponse(
                    status_code=429,
                    content=APIResponse(
                        success=False,
                        error={
                            "error_code": "RATE_LIMIT_EXCEEDED",
                            "message": "Too many requests",
                            "details": {
                                "limit": self.requests_per_minute,
                                "window": "60 seconds"
                            }
                        }
                    ).model_dump()
                )
            self.requests[client_ip].append(now)
        else:
            self.requests[client_ip] = [now]

        return await call_next(request)

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Add timing to response metadata if it's our APIResponse
        if isinstance(response, JSONResponse):
            try:
                content = response.body.decode()
                data = json.loads(content)
                if "metadata" in data:
                    data["metadata"]["process_time"] = process_time
                    response = JSONResponse(
                        status_code=response.status_code,
                        content=data
                    )
            except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
                pass
        
        response.headers["X-Process-Time"] = str(process_time)
        return response

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = str(uuid.uuid4())
        logger.info(
            f"Request: {request.method} {request.url}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client_ip": request.client.host
            }
        )
        
        response = await call_next(request)
        
        logger.info(
            f"Response: {response.status_code}",
            extra={
                "request_id": request_id,
                "status_code": response.status_code
            }
        )
        
        # Add request_id to response metadata if it's our APIResponse
        if isinstance(response, JSONResponse):
            try:
                content = response.body.decode()
                data = json.loads(content)
                if "metadata" in data:
                    data["metadata"]["request_id"] = request_id
                    response = JSONResponse(
                        status_code=response.status_code,
                        content=data
                    )
            except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
                pass
                
        return response
    
class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Handle all errors and convert to consistent API responses."""
        try:
            response = await call_next(request)
            return response
            
        except APIError as exc:
            logger.warning(
                f"API Error: {exc.message}",
                extra={
                    "error_code": exc.error_code,
                    "details": exc.details,
                    "path": request.url.path
                }
            )
            return JSONResponse(
                status_code=exc.status_code,
                content=APIResponse(
                    success=False,
                    error=exc.to_dict()
                ).model_dump()
            )
            
        except ValueError as exc:
            # Handle FastAPI's built-in validation errors
            return JSONResponse(
                status_code=422,
                content=APIResponse(
                    success=False,
                    error={
                        "error_code": "VALIDATION_ERROR",
                        "message": str(exc),
                        "details": {"type": "ValueError"}
                    }
                ).model_dump()
            )
            
        except Exception as exc:
            # Unexpected errors
            logger.error(
                f"Unexpected error: {str(exc)}",
                exc_info=True,
                extra={"path": request.url.path}
            )
            return JSONResponse(
                status_code=500,
                content=APIResponse(
                    success=False,
                    error={
                        "error_code": "INTERNAL_ERROR",
                        "message": "An unexpected error occurred",
                        "details": {"type": str(type(exc).__name__)}
                    }
                ).model_dump()
            )