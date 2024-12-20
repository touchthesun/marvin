# Roadmap

#### Phase 1: Core Browser Extension MVP
- **Browser Integration**
  - Chrome extension setup
  - Tab state monitoring
  - Bookmark access
  - Basic UI shell

- **Knowledge Graph Foundation**
  - Neo4j setup and integration
  - Basic content storage
  - Simple relationship mapping
  - Initial data models

- **Basic LLM Integration**
  - Provider abstraction layer
  - Simple query-response flow
  - Local model support

#### Phase 2: Core Assistant Features
- **Content Understanding**
  1. **Metadata Extraction**
     - Parse HTML meta tags
     - Extract OpenGraph and schema.org markup
     - Detect metadata quality/availability
     - Store structured metadata in graph

  2. **Content Analysis**
     - Implement keyword extraction algorithms
     - Generate text embeddings
     - Create similarity functions
     - Add content-based relationships to graph
  
  3. **LLM Integration**
     - Develop categorization prompts
     - Implement category assignment
     - Add verification/refinement layer
     - Create LLM-based relationships
  
  4. **Hybrid System**
     - Implement fallback strategy
     - Balance approach selection
     - Optimize for quality/cost
     - Create unified search interface

- **Task Execution**
  - Basic autonomous actions
  - Web search integration
  - Task status tracking
  - Result presentation


#### Phase 3: Security & Advanced Features
- **Security Implementation**
  - Local data encryption
  - Secure API key management
  - Task execution sandboxing
  - Privacy controls and data isolation
  - Secure storage for user preferences
  - Backup and recovery systems
  - Provider isolation implementation

- **Enhanced Knowledge Graph**
  - Complex relationship mapping
  - Automated categorization
  - Relevance scoring
  - Graph visualization


- **Advanced Assistant Capabilities**
  - Research synthesis
  - Pattern recognition
  - Proactive suggestions
  - Custom task creation
  - User feedback integration


#### Phase 4: Production Readiness
- **Cross-Browser Support**
  - Firefox extension
  - Safari extension
  - State sync across browsers

- **Advanced Features**
  - Collaborative features
  - Knowledge sharing
  - Custom plugins
  - Advanced visualization


## Critical Path Dependencies
1. Browser extension framework selection
2. Neo4j integration method within extension
3. LLM provider selection and integration
4. Security model implementation

## MVP Workflow
### **Basic Knowledge Graph Generation:**

  - Take URL(s) as input
  - Extract content and metadata
  - Generate knowledge graph nodes and relationships
  - Store in Neo4j
  - Enable basic querying


### **Simple Extension Interface:**

  - Access current tab content/URL
  - Send to Python backend
  - Display status in popup


### **Local Python Backend:**

  - Runs LLM service
  - Processes URLs through knowledge graph generator
  - Provides API for extension


### **LLM Integration with Knowledge Graph:**

  - Make graph queryable by LLM
  - Enable basic question answering using the graph
  - Implement simple context retrieval