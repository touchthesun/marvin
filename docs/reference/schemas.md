# Data Schemas

## Core Data Models

### Site
Represents a website/domain that contains pages.

```python
class Site:
    url: str                    # Base URL/domain
    name: str                   # Site name
    description: Optional[str]  # Site description
    favicon: Optional[str]      # Favicon URL
    last_crawled: datetime     # Last time any page was accessed
```

### Page
Represents a specific webpage.

```python
class Page:
    url: str                    # Full URL
    site_id: str               # Reference to parent Site
    title: str                 # Page title
    content: PageContent       # Structured content data
    last_accessed: datetime    # Last access timestamp
    metadata: PageMetadata     # Associated metadata
    embeddings: List[float]    # Vector representation for similarity
```

### PageContent
Structured representation of page content.

```python
class PageContent:
    raw_text: Optional[str]        # Raw extracted text if available
    rendered_text: Optional[str]   # Text from rendered DOM via extension
    main_content: Optional[str]    # Processed/cleaned main content
    content_blocks: List[Dict]     # Structured content blocks
    extraction_method: str         # Method used for extraction
    content_summary: str           # LLM-generated summary
```

### PageMetadata
Metadata about a page, combining extracted and inferred data.

```python
class PageMetadata:
    author: Optional[str]      # Content author
    publication_date: Optional[datetime]  # Original publish date
    modified_date: Optional[datetime]     # Last modified date
    tags: List[str]           # Extracted/inferred tags
    language: str             # Content language
    reading_time: int         # Estimated reading time in minutes
    social_signals: Dict      # Social media metrics
    source_type: str          # Blog, News, Academic, etc.
```

### ContentNode
Represents a node in the knowledge graph.

```python
class ContentNode:
    id: str                   # Unique identifier
    node_type: str            # Type of node (Concept, Topic, Fact, etc.)
    content: str              # The actual content
    source_page_id: str       # Reference to source Page
    confidence_score: float   # LLM confidence in extraction
    created_at: datetime      # Node creation timestamp
    metadata: Dict            # Additional node-specific metadata
```

### Relationship
Represents relationships between nodes in the knowledge graph.

```python
class Relationship:
    source_id: str            # Source node ID
    target_id: str            # Target node ID
    relationship_type: str    # Type of relationship
    strength: float          # Relationship strength/confidence
    evidence: str            # Supporting text/reason
    created_by: str          # 'system' or 'user'
    created_at: datetime     # Relationship creation timestamp
```

## Enums and Constants

### SourceType
```python
class SourceType(str, Enum):
    NEWS = "NEWS"                 # News articles
    BLOG = "BLOG"                # Blog posts
    ACADEMIC = "ACADEMIC"         # Academic papers, journals
    DOCUMENTATION = "DOCUMENTATION" # Technical documentation
    SOCIAL_MEDIA = "SOCIAL_MEDIA" # Social media content
    FORUM = "FORUM"              # Forum discussions
    PRODUCT = "PRODUCT"          # Product pages
    CORPORATE = "CORPORATE"      # Corporate/company pages
```

### ExtractionMethod
```python
class ExtractionMethod(str, Enum):
    BEAUTIFUL_SOUP = "BEAUTIFUL_SOUP"  # Static HTML parsing
    EXTENSION = "EXTENSION"            # Browser extension DOM access
    READABILITY = "READABILITY"        # Readability library
    CUSTOM = "CUSTOM"                  # Custom extraction method
```

## Neo4j Schema

### Node Labels
- `:Site` - Website/domain
- `:Page` - Webpage
- `:Topic` - Subject matter topic
- `:Concept` - Specific concept/idea
- `:Fact` - Extracted fact
- `:Reference` - Citation/reference
- `:User` - User node for personalization

### Relationship Types
- `:CONTAINS` - Site contains Page
- `:REFERENCES` - Page references another Page
- `:DISCUSSES` - Page discusses Topic
- `:RELATES_TO` - Topic relates to Topic
- `:SUPPORTS` - Fact supports Concept
- `:CONTRADICTS` - Fact contradicts Concept
- `:INTERESTED_IN` - User interest in Topic

### Example Cypher Queries
```cypher
// Create new page node with metadata
CREATE (p:Page {
    url: $url,
    title: $title,
    content_summary: $summary,
    created_at: datetime()
})

// Create relationship between topics
MATCH (t1:Topic {name: $topic1})
MATCH (t2:Topic {name: $topic2})
CREATE (t1)-[:RELATES_TO {strength: $strength}]->(t2)
```

## Content Extraction Process

1. **Initial Request**
   - Attempt static content extraction with BeautifulSoup
   - Store raw_text if successful

2. **Extension-based Extraction**
   - If static extraction fails or is incomplete
   - Use browser extension to access rendered DOM
   - Store rendered_text

3. **Content Processing**
   - Apply Readability algorithms if needed
   - Structure content into blocks
   - Generate main_content
   - Record extraction_method used

## Validation Rules

1. **URLs**
   - Must be valid URL format
   - Must be unique within Site/Page
   - Must include scheme (http/https)

2. **Content**
   - At least one content field must be non-null (raw_text, rendered_text, or main_content)
   - Content summary required if any content exists
   - Content blocks must have defined structure

3. **Metadata**
   - Timestamps must be in UTC
   - Language code must be valid ISO format
   - Source type must be valid enum value
   - Reading time must be positive integer

4. **Relationships**
   - Both source and target must exist
   - Strength must be between 0 and 1
   - Relationship type must be valid
   - Evidence text required for system-created relationships

5. **General**
   - All required fields must be non-null
   - String fields must be properly cleaned/sanitized
   - Confidence scores must be between 0 and 1