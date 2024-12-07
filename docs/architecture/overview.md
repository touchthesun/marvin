# Overview
Marvin is an intelligent research assistant that actively helps users organize and leverage their browsing history and research materials. Named after the character from "The Hitchhiker's Guide to the Galaxy," Marvin maintains a knowledge graph of browsing data while actively assisting users through both autonomous actions and direct queries.


## Core Principles & Constraints
- **Privacy First**: All data storage and processing must be capable of running locally
- **Model Agnostic**: Must support both local and cloud-based LLM providers
- **Extensible**: Core architecture supports future browser integration
- **Active Assistant**: Performs autonomous actions on user's behalf
- **Streamlit-Based UI**: Initial implementation uses Streamlit for rapid development
- **Neo4j Backend**: Knowledge graph implemented in Neo4j


## Key Capabilities
1. **Knowledge Organization**
   - Automated context extraction from browsing data
   - Relationship discovery between content
   - Topic and concept mapping

2. **Autonomous Actions**
   - Related content discovery via web search
   - Tab context analysis and grouping
   - Bookmark relevance filtering
   - Research synthesis and summarization

3. **Interactive Features**
   - Natural language queries about stored knowledge
   - Visualization of knowledge relationships
   - Task status monitoring
   - Configuration of autonomous behaviors



## Core Components

### Task Execution Engine
Central coordinator for autonomous actions. Interfaces with:
- LLM service for task planning
- Web search service for content discovery
- Knowledge graph for context and storage
- UI layer for status updates

### Knowledge Graph Manager
Handles all interactions with Neo4j database:
- Content and relationship storage
- Query processing
- Context preservation
- Relevance scoring

### LLM Integration Service
Abstraction layer for LLM providers:
- Provider-agnostic interface
- Context management
- Task planning capabilities
- Content analysis

### Web Search Service
Handles external content discovery:
- Academic paper search
- Related content discovery
- Source credibility assessment

## Key Interfaces

### Component Interfaces
```
Task Engine <-> LLM Service
Task Engine <-> Knowledge Graph
LLM Service <-> Knowledge Graph
Web Search <-> Task Engine
```

### External Interfaces
```
UI Layer <-> Task Engine
UI Layer <-> Knowledge Graph
Web Search <-> External Services
LLM Service <-> Model Providers
```


## Data Flow Patterns

1. **Content Processing**
   ```
   Input -> Context Extraction -> Knowledge Graph Storage
   ```

2. **Query Processing**
   ```
   Query -> LLM Analysis -> Knowledge Retrieval -> Response Generation
   ```

3. **Autonomous Tasks**
   ```
   Trigger -> Task Planning -> Action Execution -> Result Processing
   ```