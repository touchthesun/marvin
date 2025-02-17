# Marvin API Documentation

## Overview

Marvin is an intelligent research assistant that helps users organize and leverage their browsing history and research materials. The API provides endpoints for managing the knowledge graph, content analysis, and task execution.

## Core Components

### Architecture

The API is built using FastAPI and follows a modular architecture with these key components:

1. **Service Layer**
   - GraphService: Manages knowledge graph operations
   - PageService: Handles page content and metadata
   - PipelineService: Orchestrates content analysis pipelines
   - ValidationRunner: Handles input validation

2. **Middleware Stack**
   - Request Validation
   - Rate Limiting (60 requests/minute)
   - Request Timing
   - Logging
   - Error Handling

3. **Dependency Injection System**
   - Manages service lifecycles
   - Handles resource cleanup
   - Provides context management

### API Structure

```
/api/v1/
├── /pages/      # Page content management
├── /analysis/   # Content analysis endpoints
├── /graph/      # Knowledge graph operations
└── /health      # System health check
```

## Authentication

*Documentation pending implementation*

## Common Response Format

All API endpoints return responses in a standardized format:

```json
{
    "success": boolean,
    "data": object | null,
    "error": {
        "error_code": string,
        "message": string,
        "details": object
    } | null,
    "metadata": {
        "request_id": string,
        "process_time": number
    }
}
```

## Error Handling

### Error Response Format

```json
{
    "success": false,
    "error": {
        "error_code": string,
        "message": string,
        "details": object
    }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Input validation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Unexpected server error

## Service Dependencies

### Database Connection

The API requires a Neo4j database connection with the following configuration:

```python
ConnectionConfig(
    uri: str,
    username: str,
    password: str
)
```

### Service Context

All routes have access to a ServiceContext containing:
- page_service
- graph_service
- pipeline_service
- validation_runner

## Middleware Features

### Request Validation
- Validates incoming request data
- Returns 422 status for validation errors

### Rate Limiting
- 60 requests per minute per IP
- Returns 429 status when exceeded

### Request Timing
- Adds `X-Process-Time` header to responses
- Includes timing in response metadata

### Logging
- Logs all requests with unique request ID
- Includes request method, path, and client IP
- Logs response status and timing

## Development Setup

1. Configure environment variables:
   ```
   NEO4J_URI=
   NEO4J_USERNAME=
   NEO4J_PASSWORD=
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run development server:
   ```bash
   uvicorn main:app --reload
   ```

## Health Check

`GET /health`

Returns system health status and service states:

```json
{
    "status": "healthy",
    "version": string,
    "environment": "development" | "production",
    "services": {
        "pipeline": "running" | "not_initialized",
        "database": "running" | "not_initialized",
        "schema": "initialized" | "not_initialized"
    }
}
```

## Development Guidelines

### Error Handling Best Practices

1. Use custom `APIError` for known error cases
2. Include appropriate error codes and details
3. Log errors with context
4. Return consistent error responses

### Dependency Management

1. Use FastAPI dependency injection
2. Implement proper resource cleanup
3. Use context managers for service lifecycles
4. Handle initialization/shutdown properly

### Request Processing

1. Validate input data
2. Use appropriate HTTP methods
3. Include request IDs for tracking
4. Monitor processing time

## TODO

1. **Authentication/Authorization**
   - Implement authentication system
   - Add role-based access control
   - Document security features

2. **Request/Response Models**
   - Document all data models
   - Add validation rules
   - Include example payloads

3. **Service Documentation**
   - Detail service interfaces
   - Document service methods
   - Add usage examples

4. **Advanced Features**
   - WebSocket support
   - File upload handling
   - Batch operations
   - Caching strategy

## Contributing

*Documentation pending*

1. Code Style Guide
2. Testing Requirements
3. PR Process
4. Review Guidelines

