# API Models

## Common Patterns

All API responses follow a standard format using the `APIResponse` generic type:

```python
APIResponse[T] {
    success: boolean
    data: T | null
    error: {
        error_code: string
        message: string
        details: object
    } | null
    metadata: {
        request_id: string
        process_time: number
    }
}
```

## Agent Models

### Requests

#### AgentTaskType (Enum)
- `QUERY`: Direct question answering
- `RESEARCH`: In-depth research task
- `SUMMARIZE`: Summarize content/findings
- `ANALYZE`: Analyze relationships/patterns
- `RECOMMEND`: Make recommendations

#### AgentRequest
```python
{
    task_type: AgentTaskType
    query: string
    context?: Dict[str, Any]
    constraints?: Dict[str, Any]
    relevant_urls?: List[str]
    conversation_id?: UUID
}
```

#### ResearchRequest (extends AgentRequest)
```python
{
    depth: int = 2
    max_sources: int = 10
    include_domains?: List[str]
    exclude_domains?: List[str]
}
```

### Responses

#### SourceReference
```python
{
    url: string
    title?: string
    relevance_score: float
    context_used?: string
    accessed_at: datetime
}
```

#### AgentThought
```python
{
    thought: string
    action: string
    action_input: Dict[str, Any]
    observation?: string
    timestamp: datetime
}
```

#### AgentData
```python
{
    response: string
    sources: List[SourceReference]
    confidence_score: float
    thoughts?: List[AgentThought]
    metadata: Dict[str, Any]
}
```

## Analysis Models

### Requests

#### AnalysisRequest
```python
{
    url: HttpUrl
    context: BrowserContext
    tab_id?: string
    window_id?: string
    bookmark_id?: string
}
```

#### BatchAnalysisRequest
```python
{
    urls: List[AnalysisRequest]
}
```

### Responses

#### TaskData
```python
{
    task_id: string
    status: string
    progress: float
    started_at: datetime
    completed_at?: datetime
    message?: string
    stats?: Dict[str, Any]
}
```

#### TaskResult
```python
{
    keywords: Dict[str, float]
    relationships: Dict[str, float]
    metadata: Dict[str, Any]
}
```

#### TaskDetails (extends TaskData)
```python
{
    result?: TaskResult
}
```

## Graph Models

### Requests

#### RelationType (Enum)
- `LINKS_TO`: Direct link relationship
- `SIMILAR_TO`: Content similarity relationship
- `PRECEDES`: Temporal precedence
- `FOLLOWS`: Temporal following

#### GraphQuery
```python
{
    depth: int = 1
    relationship_types?: Set[RelationType]
    min_strength: float = 0.0
    limit: int = 100
}
```

#### SearchQuery
```python
{
    query: string
    domains?: List[str]
    include_metadata: bool = False
    limit: int = 100
}
```

### Responses

#### GraphNode
```python
{
    id: UUID
    url: string
    domain: string
    title?: string
    last_active?: datetime
    metadata: Dict[str, Any]
}
```

#### GraphEdge
```python
{
    source_id: UUID
    target_id: UUID
    type: string
    strength: float
    metadata: Dict[str, Any]
}
```

#### GraphData
```python
{
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata?: Dict[str, Any]
}
```

#### SearchResultData
```python
{
    results: List[GraphNode]
    total_count: int
    metadata?: Dict[str, Any]
}
```

## Page Models

### Requests

#### PageCreate
```python
{
    url: HttpUrl
    context: BrowserContext
    tab_id?: string
    window_id?: string
    bookmark_id?: string
    browser_contexts: Set[BrowserContext]
}
```

#### BatchPageCreate
```python
{
    pages: List[PageCreate]
}
```

#### PageUpdate
```python
{
    context: BrowserContext
    tab_id?: string
    window_id?: string
    bookmark_id?: string
}
```

#### PageQuery
```python
{
    context?: BrowserContext
    status?: PageStatus
    domain?: string
}
```

### Responses

#### PageMetrics
```python
{
    quality_score: float = 0.0
    relevance_score: float = 0.0
    last_visited?: datetime
    visit_count: int = 0
    processing_time?: float
    keyword_count: int = 0
}
```

#### PageRelationship
```python
{
    target_id: UUID
    type: string
    strength: float
    metadata: Dict[str, Any]
}
```

#### PageData
```python
{
    id: UUID
    url: string
    domain: string
    status: PageStatus
    discovered_at: datetime
    processed_at?: datetime
    updated_at?: datetime
    title?: string
    metadata: Dict[str, Any]
    keywords: Dict[str, float]
    relationships: List[PageRelationship]
    browser_contexts: Set[BrowserContext]
    tab_id?: string
    window_id?: string
    bookmark_id?: string
    last_active?: datetime
    metrics: PageMetrics
}
```

#### BatchPageData
```python
{
    pages: List[PageData]
    total_count: int
    success_count: int
    error_count: int
}
```

## Validation Rules

### Common Validations
- URLs must be valid HTTP/HTTPS URLs
- UUIDs must be valid v4 UUIDs
- Dates must be in ISO format
- Scores/strengths must be between 0.0 and 1.0

### Model-Specific Rules
1. **Agent**
   - Research depth must be between 1 and 5
   - Max sources must be between 1 and 50
   - Query string must not be empty

2. **Analysis**
   - At least one browser context identifier required
   - Batch requests limited to 100 URLs

3. **Graph**
   - Query depth must be between 1 and 5
   - Search query string must not be empty
   - Relationship strength must be > 0.0

4. **Page**
   - Valid browser context required
   - Batch create limited to 100 pages
   - Domain must be valid hostname

## Common Patterns and Best Practices

1. **Error Handling**
   - Use specific error codes for validation failures
   - Include detailed error messages
   - Return validation errors in standard format

2. **Batch Operations**
   - Include success/error counts
   - Return partial results on partial success
   - Follow consistent pagination patterns

3. **Metadata**
   - Include processing timestamps
   - Add relevant metrics
   - Maintain audit information

4. **Performance Considerations**
   - Use pagination for large result sets
   - Implement efficient batch operations
   - Consider caching strategies
