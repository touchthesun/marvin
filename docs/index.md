# Marvin Documentation

Welcome to the Marvin documentation. Marvin is an intelligent research assistant that helps users organize, discover, and leverage their browsing history and research materials through an active knowledge graph and LLM-powered interface.

## Quick Navigation

### 🏗 Architecture
- [System Overview](architecture/overview.md)
- [Architectural Decisions](architecture/decisions.md)
- [Development Roadmap](architecture/roadmap.md)

#### Core Components
- [API](api/api-docs.md)
- [Knowledge Graph](architecture/components/knowledge-graph.md)
- [LLM Service](architecture/components/llm-service.md)
- [Task Engine](architecture/components/task-engine.md)
- [Web Search](architecture/components/web-search.md)
- [Content Analysis](architecture/components/content-analysis.md)

### 💻 Development
- [Setup Guide](development/setup.md)
- [Coding Conventions](development/conventions.md)
- [Librariess & Dependencies](development/dependencies.md)
- [LLM Provider System](development/llm-provider.md)
- [Auth Provider System](development/auth-provider.md)
- [Testing Strategy](development/testing.md)
- [Testing Harness](development/test-harness-docs.md)
- [Security Guidelines](development/security.md)
- [Neo4J Implementation Guide](development/neo4j-integration.md)

### 📚 User Guide
- [Installation](user/installation.md)
- [Getting Started](user/getting-started.md)
- [Feature Documentation](user/features.md)
- [Privacy Policy](user/privacy.md)

### 📖 Reference
- [API Documentation](reference/api_reference.md)
- [Data Schemas](reference/schemas.md)
- [Component Interfaces](reference/interfaces/)
- [Glossary](reference/glossary.md)

## Project Overview

### Core Principles
- **Privacy First**: All data storage and processing capable of running locally
- **Model Agnostic**: Support for both local and cloud-based LLM providers
- **Browser Extension First**: Built as a browser extension from the ground up
- **Active Assistant**: Performs autonomous actions on user's behalf

### Current Status
Marvin is currently in early development. The project is following a phased approach:

- **Phase 0**: Documentation and Planning [done]
- **Phase 1**: Core Browser Extension MVP [currently in progress]
- **Phase 2**: Core Assistant Features
- **Phase 3**: Security & Advanced Features
- **Phase 4**: Production Readiness

## Contributing
Please read through the [Development Setup Guide](development/setup.md) and [Coding Conventions](development/conventions.md) before contributing to the project.

## Getting Help
- Check the [Getting Started](user/getting-started.md) guide for basic usage
- Refer to [Feature Documentation](user/features.md) for detailed information
- Review the [Glossary](reference/glossary.md) for terminology