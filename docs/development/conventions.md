# Development Conventions

## Project Structure
### Browser Extension Structure
```
marvin/
├── extension/           # Browser extension files
│   ├── manifest.json    
│   ├── background/     # Background service workers
│   ├── content/        # Content scripts
│   ├── popup/         # Extension popup UI
│   └── options/       # Extension settings UI
│
├── core/              # Core Marvin functionality
│   ├── knowledge/     # Knowledge graph operations
│   ├── llm/          # LLM service integration
│   ├── tools/        # Tools available to LLM agent
│   │   ├── search/   # Web search functionality
│   │   └── other/    # Future tools
│   └── tasks/        # Task execution engine
│
├── utils/            # Development utilities and scripts
├── tests/           # Test files mirroring src structure
├── docs/            # Documentation
```

## Code Style
### Python
- Follow PEP 8 style guide
- Maximum line length: 88 characters (Black formatter default)
- Use type hints for function parameters and return values
- Use docstrings for classes and functions (Google style)

Example:
```python
from typing import List, Optional

def process_content(
    url: str,
    content: str,
    tags: Optional[List[str]] = None
) -> dict:
    """Process webpage content and extract relevant information.

    Args:
        url: The source URL of the content
        content: Raw webpage content
        tags: Optional list of content tags

    Returns:
        dict: Processed content with metadata
    """
    pass
```

### JavaScript/TypeScript
- Use TypeScript for all new code
- Follow StandardJS style with TypeScript extensions
- Maximum line length: 80 characters
- Use functional components for React
- Use ES6+ features

Example:
```typescript
interface ContentProps {
  url: string;
  content: string;
  tags?: string[];
}

const ContentProcessor: React.FC<ContentProps> = ({
  url,
  content,
  tags = [],
}: ContentProps) => {
  // Component logic
};
```

## Git Conventions
### Branching Strategy
- `main`: Production-ready code
- `develop`: Integration branch
- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Releases: `release/version`

### Commit Messages
Follow Conventional Commits specification:
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test updates
- `chore`: Maintenance tasks

Example:
```
feat(knowledge): implement basic graph relationship creation

- Add relationship creation function
- Include type validation
- Add unit tests

Closes #123
```

## Documentation
- Keep documentation close to code
- Update docs with code changes
- Use type hints and docstrings consistently
- Include examples in documentation
- Cross-reference related documentation

## Testing
- Write tests before implementing features (TDD)
- Maintain test coverage above 80%
- Group tests by functionality
- Use meaningful test names
- Mock external dependencies

## Code Review
### Pull Request Guidelines
- Keep PRs focused and small
- Include test coverage
- Update relevant documentation
- Link related issues
- Provide context in description

### Review Checklist
- Code follows style guide
- Tests are included and pass
- Documentation is updated
- No unnecessary dependencies
- Security considerations addressed

## Tooling
### Required Tools
- Black (Python formatter)
- ESLint (JavaScript/TypeScript linter)
- Prettier (JavaScript/TypeScript formatter)
- MyPy (Python type checker)
- Jest (JavaScript testing)
- Pytest (Python testing)

### Pre-commit Hooks
- Code formatting
- Lint checking
- Type checking
- Test running