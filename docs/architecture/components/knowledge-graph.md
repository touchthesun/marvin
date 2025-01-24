# Knowledge Graph Component

## Overview
The knowledge graph is a core component of Marvin that represents relationships between web pages, their content, and derived information. It uses Neo4j as the backend database to store and query these relationships, enabling powerful content discovery and analysis.

## Purpose
The knowledge graph serves several key functions:
- Stores web content in a structured, queryable format
- Maintains relationships between related content
- Enables similarity-based content discovery
- Provides a foundation for content analysis and understanding
- Supports the LLM agent's ability to reason about user's browsing history

## Core Concepts

### Sites and Pages
The basic units of the knowledge graph are Sites (domains) and Pages (individual URLs). Each Page belongs to a Site, and contains:
- Raw content extracted from the webpage
- Processed and cleaned main content
- Metadata about the content
- Vector embeddings for similarity matching

### Content Understanding
The system processes web content in multiple layers:

#### Content Extraction
   - Raw text from HTML
   - Rendered content from JavaScript-heavy pages
   - Main content isolation using readability algorithms
   - Storage of extraction method for quality tracking

#### Metadata Processing
   - Author information
   - Publication dates
   - Content language
   - Source type (blog, news, documentation, etc.)

#### Vector Representations
   - Numerical representations of content
   - Enables similarity-based searching
   - Supports content clustering and relationship discovery

## Relationships
The knowledge graph uses various relationship types to connect content:

### Current Implementation
- `CONTAINS`: Links Sites to their Pages
- `REFERENCES`: Shows explicit links between Pages
- `RELATES_TO`: Indicates content similarity

### Planned Extensions
- `DISCUSSES`: Topics and concepts covered in content
- `SUPPORTS`/`CONTRADICTS`: Semantic relationships between content
- `INTERESTED_IN`: User interaction tracking

## Implementation Strategy

### Phase 1: Core Functionality
- Basic content storage and retrieval
- Metadata extraction and storage
- Vector embedding generation
- Simple relationship mapping

### Phase 2: Enhanced Organization
- Content block structuring
- Automated summarization
- Advanced metadata processing
- Similarity-based relationships

### Future Phases
- Semantic analysis
- User interaction tracking
- Complex relationship types
- Advanced content clustering

## Technical Details

### Neo4j Schema
```cypher
// Core node types
CREATE (s:Site {
    url: string,
    name: string,
    description: string,
    last_crawled: datetime
})

CREATE (p:Page {
    url: string,
    title: string,
    content: map,
    metadata: map,
    embeddings: list,
    last_accessed: datetime
})
```

### Key Operations
#### Content Ingestion
   - URL processing
   - Content extraction
   - Metadata parsing
   - Embedding generation

#### Relationship Management
   - Automatic relationship discovery
   - Relationship strength calculation
   - Periodic relationship updates

#### Query Capabilities
   - Content similarity search
   - Metadata-based filtering
   - Relationship traversal
   - Time-based queries

## Integration Points

### Browser Extension
- Provides new content for ingestion
- Updates page access timestamps
- Triggers content processing

### LLM Service
- Uses graph for context retrieval
- Helps generate relationships
- Assists in content categorization

### Search Service
- Enables content discovery
- Supports similarity queries
- Provides relationship-aware search

## Usage Examples

### Content Discovery
```cypher
// Find pages similar to current page
MATCH (p:Page {url: $current_url})
MATCH (p)-[:RELATES_TO]-(similar)
RETURN similar
ORDER BY similar.similarity DESC
LIMIT 10
```

### Metadata Queries
```cypher
// Find all pages by an author
MATCH (p:Page)
WHERE p.metadata.author = $author
RETURN p
```

## Future Considerations
1. Scaling strategies for large graphs
2. Backup and recovery procedures
3. Performance optimization
4. Privacy and security measures
5. Data retention policies

## Contributing
The knowledge graph component is designed to be extensible. New features can be added by:
1. Updating the schema
2. Adding new relationship types
3. Implementing new analysis methods
4. Creating new query patterns

For implementation details, see the [development setup guide](../../development/setup.md).