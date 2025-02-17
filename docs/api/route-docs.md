# API Routes

## Pages API

Base path: `/api/v1/pages`

### Create Page
```http
POST /
```

Creates a new page in the knowledge graph.

**Request Body:** `PageCreate`
```python
{
    "url": "https://example.com",
    "context": "ACTIVE_TAB",
    "tab_id": "string",          # optional
    "window_id": "string",       # optional
    "bookmark_id": "string",     # optional
    "browser_contexts": ["..."]  # Set of BrowserContext
}
```

**Response:** `PageResponse`
```python
{
    "success": true,
    "data": PageData,
    "error": null,
    "metadata": {
        "timestamp": "2024-02-16T12:00:00Z"
    }
}
```

**Error Responses:**
- `422`: Validation error
- `500`: Internal server error

### Batch Create Pages
```http
POST /batch
```

Creates multiple pages in a single transaction.

**Request Body:** `BatchPageCreate`
```python
{
    "pages": [PageCreate]
}
```

**Response:** `BatchPageResponse`
```python
{
    "success": true,
    "data": {
        "pages": [PageData],
        "total_count": int,
        "success_count": int,
        "error_count": int
    },
    "metadata": {
        "timestamp": "2024-02-16T12:00:00Z"
    }
}
```

**Error Responses:**
- `422`: Validation error
- `500`: Internal server error

### Query Pages
```http
GET /
```

Queries pages based on specified filters.

**Query Parameters:**
- `context`: (optional) Browser context filter
- `status`: (optional) Page status filter
- `domain`: (optional) Domain filter

**Response:** `BatchPageResponse`
```python
{
    "success": true,
    "data": {
        "pages": [PageData],
        "total_count": int,
        "success_count": int,
        "error_count": int
    },
    "metadata": {
        "timestamp": "2024-02-16T12:00:00Z"
    }
}
```

## Analysis API

Base path: `/api/v1/analysis`

### Analyze Page
```http
POST /analyze
```

Submits a URL for analysis.

**Request Body:** `PageCreate`
```python
{
    "url": "https://example.com",
    "context": "ACTIVE_TAB",
    "tab_id": "string",          # optional
    "window_id": "string",       # optional
    "bookmark_id": "string"      # optional
}
```

**Response:** `TaskResponse`
```python
{
    "success": true,
    "task_id": "string",
    "status": "enqueued",
    "progress": 0.0,
    "message": "Task successfully enqueued"
}
```

**Error Responses:**
- `422`: Invalid request
- `500`: Internal server error

### Get Analysis Status
```http
GET /status/{task_id}
```

Retrieves the status of an analysis task.

**Path Parameters:**
- `task_id`: ID of the analysis task

**Response:** `TaskResponse`
```python
{
    "success": true,
    "task_id": "string",
    "status": "string",
    "progress": float,
    "message": "string",
    "error": "string"           # optional
}
```

**Possible Status Values:**
- `enqueued`: Task is waiting to be processed
- `processing`: Task is being processed
- `completed`: Task has finished successfully
- `error`: Task failed
- `not_found`: Task ID doesn't exist

## Graph API

Base path: `/api/v1/graph`

### Get Related Pages
```http
GET /related/{url}
```

Retrieves pages related to the given URL.

**Path Parameters:**
- `url`: URL to find related pages for

**Query Parameters:**
- `depth`: Search depth (default: 1, range: 1-3)
- `relationship_types`: Optional list of relationship types to include

**Response:** `GraphResponse`
```python
{
    "success": true,
    "nodes": [GraphNode],
    "relationships": [GraphEdge]
}
```

**Error Responses:**
- `422`: Invalid parameters
- `500`: Internal server error

### Search Graph
```http
GET /search
```

Searches the knowledge graph for pages matching the query.

**Query Parameters:**
- `query`: Search query string
- `limit`: Maximum number of results (default: 100)

**Response:** `GraphResponse`
```python
{
    "success": true,
    "nodes": [GraphNode],
    "relationships": []
}
```

## Common Features

### Transaction Management
- All database operations use transactions
- Automatic rollback on errors
- Explicit commit after successful operations

### Validation
- Request validation using Pydantic models
- Additional validation through ValidationRunner service
- Multiple validation levels (API, Domain, Data)

### Error Handling
- Consistent error response format
- Detailed error messages
- Error categorization
- Transaction rollback on errors

### Logging
- Request/response logging
- Error logging with stack traces
- Performance metrics
- Debug information for development

## Rate Limits and Quotas

### Global Limits
- Maximum batch size: 100 items
- Rate limit: 60 requests per minute per IP

### Endpoint-Specific Limits
- Graph depth: Maximum of 3 levels
- Search results: Maximum of 100 items per query
- Analysis tasks: Maximum of 10 concurrent tasks per user

## Performance Considerations

### Batch Operations
- Use batch endpoints for multiple items
- Consider pagination for large result sets
- Monitor response times

### Graph Operations
- Limit depth for performance
- Use relationship filters to reduce response size
- Consider caching for frequent queries

### Analysis Tasks
- Asynchronous processing
- Status polling with exponential backoff
- Resource usage monitoring

## Future Endpoints

### Planned Additions
1. Page Updates
   - Update page metadata
   - Update relationships
   - Update browser context

2. Graph Analytics
   - Path finding
   - Centrality metrics
   - Clustering analysis

3. Batch Operations
   - Bulk updates
   - Batch deletions
   - Status updates

4. Advanced Search
   - Full-text search
   - Semantic search
   - Time-based queries
