# Marvin Test Harness: Lessons Learned & Integration Testing Guide

## Key Patterns for Successful Mocked Testing

### Request/Response Flow Handling

What Works:

- Clear separation between route matching, parameter extraction, and handler execution
- Consistent API response format across all endpoints
Proper error handling at each stage of request processing

Critical Implementation Details:

- Path parameter extraction using regex with fallbacks for URL-encoded values
- Explicit parameter passing between route matchers and handlers
- Consistent response structure with success/error indicators

Dependency:
```
Browser Simulator → API Mock → Neo4j Mock
                  ↘ LLM Mock ↗
```

### Authentication & Authorization Flow

What Works:

- Token extraction and validation consistent across endpoints
- Explicit header passing between components
- Clear separation between admin and user authentication

Critical Implementation Details:

- Authentication headers must be consistently passed through all layers
- Token validation should occur early in the request handling pipeline
- Token extraction needs multiple fallback mechanisms for different request types

### Mock Service State Management

What Works:

- Proper initialization of mock state objects
- Consistent state updates across operations
- State isolation between test scenarios

Critical Implementation Details:

- State reset between test runs
- Properly nested state objects (auth, providers, provider_credentials)
- Atomic state updates with validation

### URL and Path Parameter Handling

What Works:

- Special handling for URL-encoded parameters
- Pattern matching for extracting path parameters
- Consistent URL normalization

Critical Implementation Details:

- URL encoding/decoding in paths
- Regex pattern generation from route templates
- Special URL parameter extraction for graph-related routes

### Task Processing and Async Operations

What Works:

- Simulated async task processing with state transitions
- Proper polling with timeout and retry limits
- Task state management with progress tracking

Critical Implementation Details:

- Task status transitions (enqueued → processing → completed)
- Consistent task result structure
- Timeout and retry handling in long-running operations

## Transitioning to Real Integration Testing

### Service Wrapper Strategy

Create lightweight wrappers around real services that:

- Implement the same interfaces as your mocks
- Handle real service initialization/shutdown
- Manage connection details and credentials

```python
class RealNeo4jService(BaseMockService):
    """Real Neo4j service that implements the same interface as MockNeo4jService."""
    
    async def initialize(self):
        # Initialize real Neo4j connection
        # Setup test database
        return self
        
    async def clear_data(self):
        # Run MATCH (n) DETACH DELETE n
        # Instead of in-memory reset
```

### Environment Configuration

Create configuration profiles for different test environments:

```json
{
  "environment": "integration",
  "use_real_neo4j": true,
  "use_real_api": false,
  "use_real_llm": false,
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "testpassword"
  },
  "api": {
    "base_url": "http://localhost:8000"
    }
  }
```

### Progressive Integration Strategy

Incrementally replace mocks with real components:

Stage 1: Neo4j Integration

- Replace Neo4j mock with real database
- Keep API and LLM mocked
- Test graph operations with real persistence

Stage 2: LLM Integration

- Add real LLM provider
- Test provider management, token handling
- Keep API mocked

Stage 3: API Integration

- Replace API mock with real API
- End-to-end testing of the complete system

### Test Data Management

For predictable integration tests:

- Create repeatable test data initialization scripts
- Implement database reset capabilities
- Use consistent test artifacts across environments

```python
async def setup_test_data(self):
    """Set up integration test data."""
    # Clear existing data
    await self.neo4j.run_query("MATCH (n) DETACH DELETE n")
    
    # Load test fixtures
    with open("test_data/pages.cypher") as f:
        cypher = f.read()
        await self.neo4j.run_query(cypher)
```

### Debugging Integration Tests

Strategies that worked during mock testing:

- Enhanced logging at service boundaries
- Transaction monitoring for multi-step operations
- Parameter tracing through service calls
- State snapshots before/after operations

Key logging points:

```python
self.logger.info(f"Service call to {service} with parameters: {params}")
self.logger.info(f"Response from {service}: {json.dumps(response)[:200]}...")
self.logger.info(f"State before operation: {snapshot_before}")
self.logger.info(f"State after operation: {snapshot_after}")
```

## Common Failure Patterns & Mitigations

### URL Encoding Issues

Problem: URLs with special characters need proper encoding/decoding when used as path parameters
Mitigation:

Implement consistent URL encoding/decoding
Add special handling for URL path parameters
Use proper pattern matching for URL paths

### Authentication Header Propagation

Problem: Auth tokens not properly passed through the request chain
Mitigation:

Ensure consistent header propagation
Include multiple token extraction methods
Validate token early in request processing

### Task Polling Timeouts

Problem: Task completion polling might time out or waste resources
Mitigation:

Implement exponential backoff
Set reasonable timeouts and retry limits
Add early termination for known failure states

### Inconsistent Response Format

Problem: Different response formats between mocks and real services
Mitigation:

Standardize on common response format
Implement adapters for real service responses
Add response validation layer

### State Contamination Between Tests

Problem: Test state leaking between scenarios
Mitigation:

Reset state between test runs
Isolate test data using unique identifiers
Implement transactional test boundaries

## Integration Test Checklist

When transitioning from mocked to real services:

### Verify Connection Parameters

- Database connection strings
- API endpoints
- Authentication credentials

### Confirm Test Setup/Teardown

- Data initialization works
- Resource cleanup is reliable
- Test isolation is maintained

### Validate Error Handling

- Connection failures are handled
- Timeouts are properly managed
- Error responses match expected format

### Check Performance

- Tests complete in reasonable time
- Resource usage is appropriate
- No connection leaks

### Monitor Real Systems

- Database usage metrics
- API request counts
- LLM token consumption
