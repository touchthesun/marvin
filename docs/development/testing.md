# Testing Documentation

## Overview
Marvin follows test-driven development (TDD) practices. Tests are written before implementation code, helping ensure code quality and preventing regressions. The project uses different testing frameworks for Python backend and TypeScript frontend code.

## Testing Stack
### Python Backend
- **pytest**: Primary testing framework
- **pytest-asyncio**: For testing async code
- **pytest-cov**: For coverage reporting
- **pytest-mock**: For mocking dependencies
- **httpx**: For testing FastAPI endpoints

### TypeScript Frontend
- **Jest**: Primary testing framework
- **Testing Library**: For React component testing
- **MSW (Mock Service Worker)**: For mocking API requests

## Directory Structure
```
marvin/
└── tests/
    ├── unit/                 # Unit tests
    │   ├── core/            # Backend core functionality
    │   │   ├── llm/        
    │   │   ├── tools/      
    │   │   ├── knowledge/  
    │   │   └── tasks/      
    │   ├── utils/          # Backend utilities
    │   └── extension/      # Frontend components
    │       ├── components/
    │       └── services/
    ├── integration/         # Integration tests
    │   ├── api/            # Backend API tests
    │   ├── graph/          # Graph operation tests
    │   └── extension/      # Frontend integration tests
    ├── fixtures/           # Shared test fixtures and data
    └── __mocks__/         # Shared mock data and services
```

## Test Configuration

### Python Tests (pytest.ini)
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = --verbose --cov=marvin --cov-report=term-missing
```

### TypeScript Tests (jest.config.js)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ]
};
```

## Writing Tests

### Python Backend Tests
```python
import pytest
from marvin.core.llm.service import MarvinLLMService
from marvin.core.knowledge import KnowledgeGraph

class TestLLMService:
    @pytest.fixture
    def llm_service(self):
        """Create a test LLM service instance."""
        return MarvinLLMService()

    @pytest.mark.asyncio
    async def test_llm_initialization(self, llm_service):
        """Test LLM service initialization with config."""
        config = {...}  # Test configuration
        await llm_service.initialize_model(config)
        assert llm_service.llm is not None
```

### TypeScript Frontend Tests
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeGraphView } from '../components/KnowledgeGraphView';

describe('KnowledgeGraphView', () => {
  it('should render graph visualization', () => {
    const testData = {...};  // Test data
    render(<KnowledgeGraphView data={testData} />);
    expect(screen.getByTestId('graph-container')).toBeInTheDocument();
  });
});
```

## Test Types

### Unit Tests
- Test individual components in isolation
- Mock external dependencies
- Focus on single responsibility
- Fast execution

### Integration Tests
- Test component interactions
- Use real dependencies when possible
- Verify system integration
- More comprehensive coverage

### Browser Extension Tests
- Test extension-specific functionality
- Mock browser APIs
- Test content script injection
- Test popup behavior

## Running Tests

### Backend Tests
```bash
# Run all tests
pytest

# Run specific test file
pytest tests/unit/core/llm/test_service.py

# Run with coverage report
pytest --cov

# Run specific test case
pytest tests/unit/core/llm/test_service.py::TestLLMService::test_llm_initialization
```

### Frontend Tests
```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Continuous Integration
- Tests run on every pull request
- Coverage reports generated automatically
- Failed tests block merging
- Integration tests run in staging environment

## Best Practices
1. **Follow TDD Cycle**
   - Write failing test
   - Write minimal code to pass
   - Refactor while keeping tests green

2. **Test Organization**
   - Group related tests
   - Use descriptive names
   - Maintain test independence

3. **Mocking Guidelines**
   - Mock external services
   - Use fixtures for complex objects
   - Keep mocks simple and focused

4. **Coverage Goals**
   - Maintain 80% minimum coverage
   - Focus on critical paths
   - Document uncovered edge cases

5. **Test Documentation**
   - Clear test descriptions
   - Document test data sources
   - Explain complex test setups

## Common Testing Patterns

### Testing Async Operations
```python
@pytest.mark.asyncio
async def test_async_operation():
    result = await async_function()
    assert result is not None
```

### Testing Graph Operations
```python
def test_graph_relationship_creation(graph):
    node1 = graph.create_node({"type": "Article"})
    node2 = graph.create_node({"type": "Topic"})
    rel = graph.create_relationship(node1, node2, "RELATES_TO")
    assert rel is not None
```

### Testing React Components
```typescript
test('component interaction', () => {
  render(<Component />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Updated')).toBeInTheDocument();
});
```