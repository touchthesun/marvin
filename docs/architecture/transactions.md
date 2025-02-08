# Transaction System

## Overview

The Marvin pipeline system uses transactions to ensure data consistency and atomicity across operations. This document explains our transaction system, its implementation, and common usage patterns.

## Why Transactions?

The pipeline processes web pages through multiple stages, each involving state changes and data persistence. Transactions ensure that these operations either complete fully or roll back completely, preventing partial updates that could leave the system in an inconsistent state.

Key benefits:
- Atomic operations across multiple stages
- Consistent state management
- Automatic rollback on failures
- Clear boundaries for operations
- Simplified error handling

## Transaction System Components

### Transaction Class

The `Transaction` class provides the core functionality:

```python
class Transaction:
    def __init__(self):
        self._neo4j_tx = None
        self._operations = []
        self._rollback_handlers = []
        self.logger = get_logger(__name__)

    async def commit(self):
        """Commit the transaction."""
        try:
            if self._neo4j_tx:
                await self._neo4j_tx.commit()
        except Exception as e:
            await self.rollback()
            raise

    async def rollback(self):
        """Rollback the transaction with handlers."""
        for handler in reversed(self._rollback_handlers):
            await handler()
```

Key features:
- Support for Neo4j transactions
- Custom rollback handlers
- Automatic rollback on failure
- Logging and error tracking

## Implementation Patterns

### 1. Service-Level Transactions

All services extend `BaseService`, which provides transaction support:

```python
class BaseService:
    async def execute_in_transaction(self, tx: Transaction, operation: str, *args, **kwargs) -> Any:
        """Execute an operation within a transaction context."""
        try:
            method = getattr(self, f"_{operation}")
            result = await method(tx, *args, **kwargs)
            return result
        except Exception as e:
            self.logger.error(f"Operation {operation} failed: {str(e)}")
            raise
```

### 2. Transactional Operations Pattern

Services implement transaction-aware operations using a consistent pattern:

```python
class PipelineService(BaseService):
    # Public method
    async def process_url(self, url: str, metadata: Dict[str, Any]) -> None:
        await self.execute_in_transaction("_process_url_operation", url, metadata)

    # Internal transaction-aware method
    async def _process_url_operation(self, tx: Transaction, url: str, metadata: Dict[str, Any]) -> None:
        try:
            # Operation logic here
            tx.add_rollback_handler(lambda: self._handle_rollback(url))
        except Exception as e:
            self.logger.error(f"Processing failed: {str(e)}")
            raise
```

Key aspects:
- Public methods wrap transaction execution
- Internal methods handle the actual operation
- Rollback handlers for cleanup
- Consistent error handling

### 3. State Management with Rollback

Example of managing state changes with rollback support:

```python
async def _enqueue_urls_operation(self, tx: Transaction, items: List[Dict[str, Any]]) -> None:
    for item in items:
        # Update state
        status_entry = {"status": "queued", "url": item["url"]}
        self.processed_urls[item["url"]] = status_entry
        
        # Add rollback handler
        tx.add_rollback_handler(
            lambda url=item["url"]: self.processed_urls.pop(url, None)
        )
```

### 4. Complex Operations

For operations involving multiple steps:

```python
async def _process_page_operation(self, tx: Transaction, page: Page) -> None:
    # 1. Update initial state
    await self._update_state(tx, page, "processing")
    
    # 2. Process content
    result = await self._process_content(tx, page)
    
    # 3. Store results
    await self._store_results(tx, page, result)
    
    # Add rollback handler for the entire operation
    tx.add_rollback_handler(
        lambda: self._cleanup_page_processing(page.id)
    )
```

## Best Practices

1. **Transaction Boundaries**
   - Keep transactions as short as practical
   - Include only related operations
   - Consider performance implications

2. **Rollback Handlers**
   - Add handlers immediately after state changes
   - Make handlers idempotent
   - Test rollback scenarios

3. **Error Handling**
   - Log errors with context
   - Ensure proper cleanup on failure
   - Propagate appropriate errors

4. **State Management**
   - Keep state changes atomic
   - Track state changes for rollback
   - Validate state transitions

## Common Pitfalls

1. **Long-Running Transactions**
   - Can lead to resource contention
   - Increase chance of conflicts
   - Solution: Break into smaller transactions

2. **Missing Rollback Handlers**
   - Can leave system in inconsistent state
   - Solution: Add handlers for all state changes

3. **Nested Transactions**
   - Can lead to complexity
   - Solution: Keep transaction boundaries clear

4. **Resource Leaks**
   - Failing to clean up resources
   - Solution: Use try/finally and rollback handlers

## Testing Transactions

Example of testing transaction behavior:

```python
async def test_process_url_rollback():
    service = PipelineService()
    url = "http://example.com"
    
    # Force failure during processing
    with pytest.raises(ProcessingError):
        await service.process_url(url, {"force_error": True})
        
    # Verify state was rolled back
    assert url not in service.processed_urls
```

Remember to test:
- Happy path completion
- Various failure scenarios
- Rollback behavior
- Resource cleanup
- Concurrent operations
