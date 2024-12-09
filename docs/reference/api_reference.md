# Marvin API Reference

## Overview
Marvin's API is built using FastAPI and provides endpoints for knowledge graph operations, LLM interactions, task management, and system configuration. The API is designed to be consumed by the browser extension and potentially other clients in the future.

## Base URL
For local development:
```
http://localhost:8000
```

## Authentication
Currently, the API is designed for local access only. Authentication will be added in future releases for remote deployment scenarios.

## Endpoints

### Knowledge Graph Operations

#### Add URL to Knowledge Graph
```http
POST /graph/url
```

Adds a single URL to the knowledge graph.

**Request Body:**
```json
{
  "url": "string",
  "metadata": {
    "additional": "properties"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "node_id": "string",
  "relationships_created": 0
}
```

#### Batch Add URLs
```http
POST /graph/urls
```

Add multiple URLs to the knowledge graph in a single request.

**Request Body:**
```json
{
  "urls": ["string"],
  "metadata": {
    "additional": "properties"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "nodes_created": 0,
  "relationships_created": 0
}
```

### LLM Operations

#### Query LLM
```http
POST /llm/query
```

Send a query to the current LLM configuration.

**Request Body:**
```json
{
  "query": "string",
  "context": {
    "additional": "context"
  }
}
```

**Response:**
```json
{
  "response": "string",
  "metadata": {
    "model": "string",
    "tokens_used": 0
  }
}
```

#### Update LLM Configuration
```http
POST /llm/config
```

Update the LLM configuration.

**Request Body:**
```json
{
  "model_type": "string",
  "model_name": "string",
  "provider": "string",
  "api_key": "string",
  "model_params": {
    "additional": "parameters"
  }
}
```

### Task Operations

#### Create Task
```http
POST /tasks/
```

Create a new asynchronous task.

**Request Body:**
```json
{
  "type": "string",
  "parameters": {
    "additional": "parameters"
  }
}
```

**Response:**
```json
{
  "task_id": "string",
  "status": "pending"
}
```

#### Get Task Status
```http
GET /tasks/{task_id}
```

Get the status of a specific task.

**Response:**
```json
{
  "task_id": "string",
  "status": "string",
  "result": "object",
  "created_at": "timestamp",
  "completed_at": "timestamp"
}
```

### System Operations

#### System Status
```http
GET /system/status
```

Get the current system status.

**Response:**
```json
{
  "neo4j_connected": true,
  "llm_status": "ready",
  "current_model": "string",
  "task_queue_size": 0
}
```

## Error Handling

All endpoints return standard HTTP status codes:
- 200: Success
- 400: Bad Request
- 404: Not Found
- 500: Internal Server Error

Error responses include a message and optional details:
```json
{
  "error": "string",
  "details": "string",
  "code": "string"
}
```

## Rate Limiting
- Local deployments: No rate limiting
- Future remote deployments: Limits TBD

## Async Operations
Long-running operations return a task ID and can be monitored via the tasks endpoints.

## Related Documentation
- [Development Setup](../../development/setup.md)
- [Security Considerations](../../development/security.md)