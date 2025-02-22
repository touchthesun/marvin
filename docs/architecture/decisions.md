# Architectural Decisions

## Overview
This document records the key architectural decisions made in the Marvin project and their rationales. These decisions shape the fundamental structure and capabilities of the system.

## Browser Extension First
**Decision**: Develop Marvin as a browser extension from the start rather than beginning with a standalone application.

**Rationale**:
- Direct access to browser state and behavior is crucial for core functionality
- Avoiding future migration complexity from standalone to extension
- Better user experience through seamless browser integration
- Access to browser APIs for bookmarks, tabs, and navigation
- Reduced need for workarounds to access browser state

**Trade-offs**:
- More complex initial development
- Browser-specific considerations from day one
- Need for separate extensions per browser
- More complex testing environment

## Neo4j as Knowledge Graph Backend
**Decision**: Use Neo4j as the primary database for storing and managing the knowledge graph.

**Rationale**:
- Native graph database optimized for relationship queries
- Mature, well-documented system with strong community support
- Rich query language (Cypher) for complex relationship traversal
- Built-in support for graph algorithms and analytics
- Capable of running locally, supporting our privacy-first principle

**Trade-offs**:
- Additional system dependency for users
- Learning curve for Cypher query language
- Resource requirements for local deployment

## LLM Provider Abstraction
**Decision**: Implement a provider-agnostic abstraction layer for LLM integration.

**Rationale**:
- Support for both local and cloud-based models
- Privacy concerns require option for local-only operation
- Rapid evolution of LLM technology requires flexibility
- Different users may have different provider preferences
- Cost management through provider selection

**Trade-offs**:
- Additional complexity in implementation
- Potential limitations in provider-specific features
- Need to maintain multiple provider integrations

## Security Model
**Decision**: Implement security features as part of Phase 3, with architecture supporting security from the start.

**Rationale**:
- Early phases focus on core functionality validation
- Security implementation requires stable core architecture
- Phase 3 timing allows for comprehensive security implementation
- Architecture designed with security hooks from beginning

**Trade-offs**:
- Initial versions have basic security
- Need for potential refactoring for security features
- Limited initial deployment scope

## Browser Compatibility
**Decision**: Focus initially on Chrome, with architecture supporting cross-browser deployment.

**Rationale**:
- Chrome has largest market share
- Well-documented extension APIs
- Strong developer tools
- Clear migration path to other browsers
- Established patterns for cross-browser support

**Trade-offs**:
- Initial limitation to Chrome users
- Need for browser-specific adaptations later
- Potential feature limitations in other browsers

## Local-First Architecture
**Decision**: Design system to operate fully locally with optional cloud integration.

**Rationale**:
- Privacy protection for user data
- Reduced dependency on external services
- Support for sensitive use cases
- User control over their data
- Compliance with privacy regulations

**Trade-offs**:
- Increased local resource requirements
- More complex deployment
- Limited collaborative features initially
- Need for local backup solutions

## Future Considerations
- Cross-browser synchronization strategies
- Collaborative feature implementation
- Plugin architecture for extensibility
- Mobile browser support


## Dependency Injection Decision

Context: 
The content analysis system initially used a singleton pattern for context management, which presented several challenges as the system grew in complexity.

### Pros of Dependency Injection

 - Explicit Dependencies

Dependencies are clearly visible in constructor signatures
Makes code more maintainable and easier to understand
Prevents hidden coupling between components


 - Improved Testing

Each test can use its own isolated context
Easy to mock dependencies
No need to manage global state between tests
Can test different implementations easily


 - Better Flexibility

Easy to swap implementations
Supports different contexts for different environments
Can implement different backends without changing client code


 - Better Concurrency Support

No shared global state
Each instance has its own isolated context
Reduces risk of race conditions


 - Clearer Resource Management

Resources tied to specific instances
Clear lifecycle management
Better control over cleanup



### Cons of Dependency Injection

 - Increased Initial Complexity

More setup code required
Need to manage dependency graph
More initial boilerplate


 - Configuration Management

Need to manage configuration at composition root
More complex startup process
Need to carefully manage dependency order


 - Learning Curve

Team needs to understand DI patterns
May be unfamiliar to some developers
Requires more disciplined coding approach



# LLM Provider Architecture

## Overview
The LLM Provider subsystem is designed to provide a flexible, maintainable interface for interacting with various Large Language Model providers. This document outlines the key architectural decisions and patterns used in its implementation.

## Core Design Decisions

### Single Client with Method-Specific Models

**Decision**: Implement LLM provider interactions using a single client class with endpoint-specific request and response models.

**Rationale**:
- Provides a unified point of HTTP communication while maintaining clear separation of endpoint concerns
- Enables strong type safety through endpoint-specific models
- Simplifies testing and mocking by centralizing HTTP interactions
- Allows for consistent error handling and logging across all endpoints
- Makes it easier to implement provider-specific optimizations

**Trade-offs**:
- More boilerplate code compared to generic request/response handling
- Requires careful maintenance of model synchronization with provider APIs
- Slightly increased initial development time for new endpoints

**Implementation Pattern**:
```python
# Base models for consistency
class OllamaRequest:
    def to_json(self) -> dict: ...

class OllamaResponse:
    @classmethod
    def from_json(cls, data: dict) -> "OllamaResponse": ...

# Endpoint-specific models
class GenerateRequest(OllamaRequest):
    """Request parameters for /api/generate endpoint"""

class GenerateResponse(OllamaResponse):
    """Response from /api/generate endpoint"""

# Single client implementation
class OllamaClient:
    async def generate(self, request: GenerateRequest) -> AsyncIterator[GenerateResponse]: ...
    async def chat(self, request: ChatRequest) -> AsyncIterator[ChatResponse]: ...
```

### Extension Guidelines
When adding new endpoints:
1. Create request/response models inheriting from base classes
2. Implement JSON serialization/deserialization
3. Add typed method to client class
4. Include comprehensive tests for new models and methods

## LLM Provider Abstraction

### Architecture Requirements

1. **Provider Agnosticism**
   - Abstract base classes defining common LLM operations
   - Provider-specific implementations hidden behind common interface
   - Standardized error handling across providers
   - Unified configuration management

2. **Local and Remote Support**
   - Abstract network transport layer
   - Support for both HTTP and local process communication
   - Consistent interface regardless of model location
   - Resource management appropriate to model type

3. **Runtime Flexibility**
   - Dynamic model loading and unloading
   - Hot-swapping between different models
   - State management for active models
   - Resource cleanup for inactive models

### Implementation Structure

```plaintext
core/
├── llm/
│   ├── providers/
│   │   ├── base.py        # Abstract base classes
│   │   ├── ollama.py      # Ollama implementation
│   │   └── openai.py      # OpenAI implementation
│   ├── models.py          # Shared model definitions
│   └── manager.py         # Provider management
```

### Key Components

1. **Provider Interface**
   - Model management (load, unload, status)
   - Request handling (generate, chat, embeddings)
   - Resource management
   - Error handling

2. **Configuration Management**
   - Provider-specific settings
   - Model parameters
   - Resource limits
   - Performance tuning

3. **State Management**
   - Active model tracking
   - Resource allocation
   - Performance metrics
   - Health monitoring

### Provider Requirements

Each provider implementation must:
1. Implement all abstract methods from base classes
2. Handle provider-specific error cases
3. Manage resources appropriately
4. Support hot-reloading of configuration
5. Implement proper cleanup on shutdown
