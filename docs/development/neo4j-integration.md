# Neo4j Integration Testing Progress Document

## Chunk 1: Understanding Current Neo4j Implementation

### Goal and Scope
- Understand how Marvin interacts with Neo4j
- Analyze connection management, transactions, and graph operations
- Identify key components that need to be addressed in the test harness

### Files Examined
- `/core/infrastructure/database/db_connection.py`
- `/core/infrastructure/database/transactions.py`
- `/core/infrastructure/database/graph_operations.py`
- `/core/infrastructure/database/schema.py`

### Key Findings

#### 1. Connection Management
- `DatabaseConnection` handles all Neo4j interaction with proper error handling
- Async-first design using Neo4j's AsyncDriver
- Connection pooling with configurable parameters
- Clean separation between connection management and business logic

```python
# Key pattern for database connection
connection = DatabaseConnection(ConnectionConfig(
    uri="neo4j://localhost:7687",
    username="neo4j",
    password="password"
))
await connection.initialize()  # Establishes and verifies connection
```

#### 2. Transaction Handling
- `Transaction` class provides a wrapper around Neo4j transactions
- Supports custom rollback handlers for complex operations
- `TransactionManager` implements retry logic with exponential backoff
- All operations use transactions for consistency

```python
# Transaction pattern
async with connection.transaction() as tx:
    # Database operations with transaction
    result = await connection.execute_query(query, parameters, transaction=tx)
```

#### 3. Graph Operations
- `GraphOperationManager` abstracts graph-specific operations (create node, create relationship, etc.)
- Strong typing with `Node` and `Relationship` data classes
- Error handling specialized for graph operations
- Support for both individual and batch operations

```python
# Graph operation pattern
manager = GraphOperationManager(connection)
node = await manager.create_node(
    labels=["Page"],
    properties={"url": "https://example.com"}
)
```

#### 4. Schema Management
- `SchemaManager` handles database constraints, indexes, and migrations
- Version tracking for schema changes
- Support for schema validation and automatic migrations

```python
# Schema initialization pattern
schema_manager = SchemaManager(connection)
await schema_manager.initialize()  # Creates constraints if needed
```

### Implementation Details

#### Connection Configuration
- Connection parameters are encapsulated in `ConnectionConfig`
- Support for connection pooling, timeouts, and retry configuration
- Clean separation of concerns between configuration and connection logic

#### Error Handling
- Specialized error classes (`DatabaseError`, `GraphOperationError`, `SchemaError`)
- Detailed error context including operation, parameters, and cause
- Consistent logging with structured data

#### Async Implementation
- All database operations are async/await compatible
- Uses Neo4j's async driver for non-blocking operations
- Context managers for resource management

#### Transaction Lifecycle
1. Begin transaction with `connection.transaction()`
2. Execute operations with transaction
3. Commit on successful completion
4. Rollback with handlers on failure

### Challenges and Considerations for Testing

1. **Mock vs. Real Database**
   - Current mocks likely simulate the Node/Relationship models
   - Need to preserve interface while switching to real database

2. **Transaction Rollback Testing**
   - Current test harness may not fully test transaction rollback with custom handlers
   - Real Neo4j will require actual transaction management

3. **Connection Management**
   - Test harness will need to manage real database connections
   - Connection pooling and cleanup becomes important

4. **Schema Management**
   - Tests may need to initialize schema before running
   - Consider test isolation with temporary constraints

5. **Data Cleanup**
   - Need strategy for cleaning data between tests
   - Consider using separate database or namespacing

### Next Steps

1. **Create Neo4j Test Environment**
   - Define isolation strategy for test data

2. **Create Test Page Corpus**
   - Identify and select a diverse set of web pages for testing
   - Include various content types (articles, docs, products, etc.)
   - Prepare local storage for test page content to ensure test stability
   - Consider capturing HTML snapshots to prevent test failures due to changing content

3. **Implement Test Database Connection**
   - Create configuration for test Neo4j
   - Implement connection initialization and cleanup

4. **Test Data Management**
   - Develop strategy for test data initialization
   - Create data cleanup mechanisms
   - Implement pipeline for converting test pages into knowledge graph entities

5. **Adapt Test Harness**
   - Modify existing mock implementation to use real Neo4j
   - Maintain same interface for backward compatibility

### Test Page Corpus Considerations

To ensure a comprehensive test of the content analysis pipeline, we should include pages with the following characteristics:

#### Content Types
- Long-form articles with headings, lists, and inline media
- Technical documentation with code blocks
- Product pages with structured data
- Landing pages with minimal text and multiple CTAs
- News articles with metadata and publication dates

#### Structure Variations
- Simple HTML structure
- Complex nested DOM hierarchies
- Dynamic content (JavaScript-rendered)
- Pages with iframes and embedded content
- Pages with various metadata implementations

#### Special Cases
- Pages with multiple languages
- Pages with tabular data
- Pages with schema.org markup
- Pages with non-standard character encodings
- Pages with accessibility considerations

## Chunk 2: Analyzing Test Harness Implementation

### Goal and Scope
- Understand the test harness architecture and component interaction
- Analyze how the test harness currently interfaces with mocked Neo4j
- Identify integration points for real Neo4j implementation

### Files Examined
- `/test_harness/__main__.py` - Main entry point for the test harness
- `/test_harness/config.py` - Configuration management
- `/test_harness/controller.py` - Core test orchestration
- `/test_harness/environment.py` - Test environment setup/teardown
- `/test_harness/scenarios/knowledge_query.py` - Example test scenario

### Key Findings

#### 1. Test Harness Architecture
- Well-structured, modular design with clear separation of concerns
- Command-line interface for flexible test execution
- Component-based architecture with dependency injection
- Configuration-driven testing approach

#### 2. Neo4j Service Implementation
- Two implementations mentioned in environment.py:
  - `MockNeo4jService` - In-memory mock implementation
  - `DockerNeo4jService` - Real Neo4j using Docker

```python
# Current approach for selecting Neo4j implementation
if self.config.get("use_docker", False):
    self.logger.info("Using Docker Neo4j service")
    service = DockerNeo4jService(neo4j_config)
else:
    self.logger.info("Using mock Neo4j service")
    service = MockNeo4jService(neo4j_config)
```

#### 3. Configuration System
- Hierarchical configuration with defaults
- Configuration can be overridden via:
  - Config files
  - Command-line arguments
  - Environment variables
- Neo4j-specific configuration nested under `neo4j` key

#### 4. Test Scenarios
- Inherit from a common `TestScenario` base class
- Implement standardized lifecycle methods:
  - `setup()` - Prepare test environment
  - `execute()` - Run test operations
  - `validate(results)` - Verify results
  - `teardown()` - Clean up resources
- Support for performance tracking and assertions

#### 5. Test Data Management
- Scenario-specific test data loaded from JSON files
- Support for loading test data into Neo4j
- Flexible browser simulator for page capture

### Implementation Details

#### Environment Setup Flow
1. `TestHarnessController` initializes and creates `TestEnvironmentManager`
2. `TestEnvironmentManager._start_neo4j()` creates the appropriate Neo4j service
3. The Neo4j service is initialized and passed to other components
4. Components like API server use the Neo4j service for operations

#### Neo4j Integration Points
1. `_start_neo4j()` in environment.py selects the service implementation
2. `DockerNeo4jService` exists but its implementation isn't shown
3. After initialization, Neo4j is passed to other components like API server

#### Test Scenario Flow
1. Scenario loads test data from JSON files
2. Test data is loaded into Neo4j during setup
3. API operations execute against Neo4j during scenario
4. Results are validated using assertions

### Key Interfaces

Based on the knowledge_query.py scenario, the Neo4j service must implement:
- `initialize()` - Set up the service and return itself
- `shutdown()` - Clean up resources
- `load_test_data(data)` - Load test data into the database
- Properties `uri`, `username`, `password` for connection info

### Integration Strategy

For successful Neo4j integration, we need to:

1. **Implement RealNeo4jService**
   - Ensure compatibility with `MockNeo4jService` interface
   - Handle test data loading and reset

2. **Enhance Test Data Management**
   - Create Cypher scripts for test data loading
   - Implement test data cleanup between scenarios
   - Support for our planned test page corpus

3. **Configure Test Isolation**
   - Ensure isolated test environment
   - Prevent test interference
   - Support concurrent test execution

### Next Steps

1. **Implement RealNeo4jService**
   - Implement based on interface requirements

2. **Create Test Data Utilities**
   - Develop helpers for test data management
   - Create robust cleanup mechanisms

3. **Implement Test Page Corpus Integration**
   - Define test page storage structure
   - Create utility for loading test pages

4. **Update Configuration**
   - Enhance Neo4j configuration options
   - Add support for specific test database

5. **Test with Simple Scenario**
   - Create minimal test scenario focused on Neo4j
   - Verify end-to-end functionality

## Chunk 3: Analyzing Content Analysis Pipeline

### Goal and Scope
- Understand how the content analysis pipeline processes web pages
- Identify how processed data is stored in the Neo4j graph database
- Determine requirements for test page corpus

### Files Examined
- `/core/domain/content/pipeline.py` - Pipeline architecture and orchestration
- `/core/domain/content/processor.py` - Content processing implementation
- `/core/domain/content/extractors.py` - Keyword extraction algorithms

### Key Findings

#### 1. Pipeline Architecture
- Modular design with clear component boundaries
- Multi-stage processing flow with validation between stages
- Transaction-aware implementation with rollback support
- Event-driven architecture for monitoring and logging

#### 2. Content Processing
- HTML and text content normalization
- Multiple keyword extraction algorithms:
  - RAKE (Rapid Automatic Keyword Extraction)
  - TF-IDF based term extraction
  - Named Entity Recognition using spaCy
- Keyword normalization and scoring
- Relationship detection between keywords

#### 3. Data Flow to Neo4j
- Page content is processed to extract keywords and relationships
- Keywords are stored with scores in the page object
- Relationships are stored in page metadata
- Transaction handling ensures atomic operations

```python
# Key pattern for updating page with keywords
page.update_keywords({
    kw.canonical_text: kw.score
    for kw in keywords
})

# Key pattern for storing relationships
page.metadata.['relationships'] = relationships
```

#### 4. Test Page Requirements
Based on the keyword extraction algorithms, our test page corpus should include:

##### Content Variety
- Pages with technical terms (for RAKE and TF-IDF)
- Pages with named entities (people, organizations, locations)
- Pages with structured content (headings, lists, tables)
- Pages with both short and long-form content

##### Language Features
- Multi-word phrases and technical terminology
- Proper nouns and named entities
- Term repetition patterns (for frequency analysis)
- Varied writing styles (academic, journalistic, technical)

##### Content Structure
- HTML with proper semantic markup
- Content with clear section boundaries
- Pages with metadata (OpenGraph, schema.org)
- Pages with embedded content (code blocks, quotes)

### Integration Considerations

#### 1. Transaction Support
- Real Neo4j must properly handle transactions used by the pipeline
- Rollback handlers must be executed when transactions fail
- Proper cleanup needed between test runs

#### 2. Keyword Storage
- Keywords are stored as nodes with relationships to pages
- Score normalization affects graph relationships
- Relationship types and strengths are crucial for testing

#### 3. Performance Considerations
- Content processing is computationally intensive
- Real Neo4j will have different performance characteristics than mock
- Need to monitor transaction performance

### Test Corpus Selection

Based on our analysis, we should include these page types in our test corpus:

1. **Academic/Technical Content**
   - Research papers or technical documentation
   - Pages with domain-specific terminology
   - Content with citations or references

2. **News/Article Content**
   - News articles with named entities
   - Feature articles with themed content
   - Content with clear topic focus

3. **Reference Content**
   - Wiki-like pages with structured information
   - Pages with lists and definitions
   - Content with cross-references

4. **Product/Service Content**
   - Product descriptions
   - Marketing materials
   - Content with brand names and product terminology

### Next Steps

1. **Create Test Page Collection**
   - Select 10-15 diverse web pages based on our requirements
   - Create local HTML snapshots for test stability
   - Develop metadata for expected extraction results

2. **Neo4j Schema Verification**
   - Examine Neo4j schema requirements from SchemaManager
   - Create test-specific schema initialization
   - Develop cleanup procedures

3. **Mock-to-Real Transition**
   - Implement test data loading for real Neo4j
   - Create serialization/deserialization for test results
   - Develop verification mechanisms for graph content

## Chunk 4: Analyzing Graph Service and Page Management

### Goal and Scope
- Understand how Neo4j is used at the service layer
- Analyze transaction patterns in graph and page services
- Identify key functionality needed in test harness for Neo4j

### Files Examined
- `/core/services/graph/graph_service.py` - High-level graph operations
- `/core/services/content/page_service.py` - Page object management
- `/core/services/content/pipeline_service.py` - Pipeline orchestration

### Key Findings

#### 1. Transaction Handling in Services
- Service layer uses `BaseService` with `execute_in_transaction` pattern
- All Neo4j operations are wrapped in transactions
- Services maintain consistent error handling and rollback support

```python
# Key transaction pattern in services
async def add_page_to_graph(self, page: Page, metadata: PageMetadata) -> Dict[str, Any]:
    async with self.graph_operations.transaction() as tx:
        # Create or update site
        site_node = await self.graph_operations.create_or_update_node(...)
        # Create or update page
        page_node = await self.graph_operations.create_or_update_node(...)
        # Create site-page relationship
        await self.graph_operations.create_relationship(...)
        return page_node
```

#### 2. Neo4j Data Preparation
- Services handle conversion between domain models and Neo4j compatible data
- Proper type conversion for Neo4j (datetimes, complex objects, etc.)
- Flattening of nested structures for graph storage

```python
# Example of data preparation for Neo4j
def _prepare_page_data(self, page: Page) -> Dict[str, Any]:
    # Flatten Page object into Neo4j-compatible dictionary
    page_data = {
        'url': str(page.url),
        'domain': str(page.domain),
        'status': str(page.status.value),  # Convert enum to string
        'title': str(page.title) if page.title else None,
    }
    # Handle keywords as primitive types
    if page.keywords:
        page_data['keywords'] = {str(k): float(v) for k, v in page.keywords.items()}
    # More conversions...
    return page_data
```

#### 3. Page and Site Management
- Pages and Sites are core graph entities
- Relationship creation between entities is transaction-aware
- Local caching with transaction-aware cache invalidation

```python
# Cache management pattern
page = self._url_to_page.get(url)
if not page:
    graph_page = await self.graph_service.execute_in_transaction(...)
    self._url_to_page[url] = page
    tx.add_rollback_handler(lambda: self._url_to_page.pop(url, None))
```

#### 4. Pipeline Orchestration
- Async queue processing for content analysis
- Status tracking with Neo4j persistence
- Complex task management with progress tracking

```python
# Pipeline service uses Neo4j for state persistence
await neo4j_tx.run(
    """
    MATCH (t:Task {id: $task_id})
    CREATE (u:URL {
        url: $url,
        status: $status,
        task_id: $task_id,
        progress: $progress,
        queued_at: $queued_at,
        browser_context: $browser_context,
        tab_id: $tab_id,
        window_id: $window_id,
        bookmark_id: $bookmark_id
    })-[:PART_OF]->(t)
    """,
    {...}
)
```

### Test Harness Integration Requirements

Based on our analysis, the test harness for real Neo4j must support:

1. **Neo4j Schema Initialization**
   - Create proper constraints and indexes
   - Support for test-specific schema
   - Schema validation before tests

2. **Transaction Support**
   - Real transaction lifecycle
   - Rollback handlers
   - Transaction retry policies

3. **Test Data Management**
   - Support for Cypher-based test data loading
   - Test data isolation between scenarios
   - Test data cleanup

4. **Node and Relationship Creation**
   - Same interface as mock for graph operations
   - Consistent error handling
   - Support for both Cypher and object-based creation

5. **Result Format Compatibility**
   - Convert Neo4j results to expected formats
   - Handle Neo4j-specific types
   - Ensure compatibility with existing test assertions

## Implementation Plan for Phase 1: Neo4j Integration

### 1. Create RealNeo4jService Implementation

```python
class RealNeo4jService:
    """Real Neo4j service for testing using local Neo4j instance."""
    
    def __init__(self, config):
        self.config = config
        self.uri = config.get("uri", "bolt://localhost:7687")
        self.username = config.get("username", "neo4j")
        self.password = config.get("password", "password")
        self.driver = None
        self.logger = get_logger("test.real.neo4j")
        self.initialized = False
    
    async def initialize(self):
        """Initialize Neo4j connection."""
        try:
            # Initialize Neo4j driver
            await self._init_driver()
            
            # Initialize or validate test schema
            await self._init_schema()
            
            self.initialized = True
            return self
            
        except Exception as e:
            self.logger.error(f"Neo4j initialization failed: {str(e)}")
            await self.shutdown()
            raise
    
    async def _init_driver(self):
        """Initialize connection to Neo4j."""
        from neo4j import AsyncGraphDatabase
        self.driver = AsyncGraphDatabase.driver(
            self.uri,
            auth=(self.username, self.password)
        )
        # Verify connectivity
        await self.driver.verify_connectivity()
        self.logger.info(f"Connected to Neo4j at {self.uri}")
        
    async def _init_schema(self):
        """Initialize or validate schema for testing."""
        # Check if we need to create test schema
        if self.config.get("use_test_schema", True):
            schema_script = self.config.get("schema_script", None)
            if schema_script:
                await self._execute_script(schema_script)
            else:
                # Apply default test schema
                await self._create_default_test_schema()
        
        # Validate schema
        is_valid = await self._validate_schema()
        if not is_valid:
            raise Exception("Neo4j schema validation failed")
    
    async def shutdown(self):
        """Shut down Neo4j resources."""
        try:
            if self.driver:
                await self.driver.close()
                self.driver = None
                
            self.initialized = False
            
        except Exception as e:
            self.logger.error(f"Neo4j shutdown error: {str(e)}")
            
    async def clear_data(self):
        """Clear all data in the graph."""
        query = "MATCH (n) DETACH DELETE n"
        await self.execute_query(query)
        
    async def load_test_data(self, data_file):
        """Load test data from Cypher or JSON file."""
        if data_file.endswith('.cypher'):
            await self._execute_script(data_file)
        elif data_file.endswith('.json'):
            await self._load_json_data(data_file)
        else:
            raise ValueError(f"Unsupported data file format: {data_file}")
        
    async def execute_query(self, query, parameters=None):
        """Execute a Cypher query against Neo4j."""
        async with self.driver.session() as session:
            result = await session.run(query, parameters or {})
            data = await result.data()
            return data
            
    async def _execute_script(self, script_path):
        """Execute a Cypher script file."""
        with open(script_path, 'r') as f:
            script = f.read()
            
        # Split script into statements
        statements = [s.strip() for s in script.split(';') if s.strip()]
        
        async with self.driver.session() as session:
            for statement in statements:
                await session.run(statement)
                
        self.logger.info(f"Executed script: {script_path}")
        
    async def _validate_schema(self):
        """Validate current schema state."""
        try:
            # Check constraints
            constraints = await self.execute_query("SHOW CONSTRAINTS")
            
            # Check indexes  
            indexes = await self.execute_query("SHOW INDEXES")
            
            # Basic validation logic
            required_constraints = ["page_url", "site_url", "keyword_id"]
            for req in required_constraints:
                found = any(c.get("name") == req for c in constraints)
                if not found:
                    self.logger.warning(f"Required constraint missing: {req}")
                    return False
                    
            self.logger.info("Schema validation passed")
            return True
            
        except Exception as e:
            self.logger.error(f"Schema validation error: {str(e)}")
            return False
            
    async def _create_default_test_schema(self):
        """Create default schema for testing."""
        constraints = [
            "CREATE CONSTRAINT page_url IF NOT EXISTS FOR (p:Page) REQUIRE p.url IS UNIQUE",
            "CREATE CONSTRAINT site_url IF NOT EXISTS FOR (s:Site) REQUIRE s.url IS UNIQUE",
            "CREATE CONSTRAINT keyword_id IF NOT EXISTS FOR (k:Keyword) REQUIRE k.id IS UNIQUE"
        ]
        
        indexes = [
            "CREATE INDEX page_metadata IF NOT EXISTS FOR (p:Page) ON (p.metadata_quality_score)",
            "CREATE INDEX keyword_normalized_text IF NOT EXISTS FOR (k:Keyword) ON (k.normalized_text)"
        ]
        
        async with self.driver.session() as session:
            for constraint in constraints:
                await session.run(constraint)
                
            for index in indexes:
                await session.run(index)
                
        self.logger.info("Created default test schema")

    async def _load_json_data(self, json_file):
        """Load test data from JSON file."""
        import json
        
        with open(json_file, 'r') as f:
            data = json.load(f)
            
        if "nodes" in data:
            await self._create_nodes_from_json(data["nodes"])
            
        if "relationships" in data:
            await self._create_relationships_from_json(data["relationships"])
            
        self.logger.info(f"Loaded JSON data from {json_file}")
        
    async def _create_nodes_from_json(self, nodes):
        """Create nodes from JSON data."""
        for node in nodes:
            labels = ":".join(node["labels"])
            properties = json.dumps(node["properties"])
            
            query = f"CREATE (:{labels} {properties})"
            await self.execute_query(query)
            
    async def _create_relationships_from_json(self, relationships):
        """Create relationships from JSON data."""
        for rel in relationships:
            query = """
            MATCH (a), (b)
            WHERE id(a) = $start_id AND id(b) = $end_id
            CREATE (a)-[r:$type $properties]->(b)
            """
            
            await self.execute_query(
                query,
                {
                    "start_id": rel["start_node_id"],
                    "end_id": rel["end_node_id"],
                    "type": rel["type"],
                    "properties": rel["properties"]
                }
            )
```

### 2. Test Page Corpus Implementation

We'll create a standard directory structure for test pages:

```
fixtures/
├── pages/
│   ├── academic/
│   │   ├── research_paper.html
│   │   └── technical_docs.html
│   ├── news/
│   │   ├── breaking_news.html
│   │   └── feature_article.html
│   ├── reference/
│   │   ├── wiki_page.html
│   │   └── dictionary_entry.html
│   └── product/
│       ├── product_page.html
│       └── marketing_material.html
├── test_data/
│   ├── basic_graph.cypher
│   ├── pages_data.cypher
│   └── relationships.cypher
```

### 3. Configuration Updates

We'll simplify our configuration to work with the local Neo4j instance:

```json
{
  "neo4j": {
    "use_real": true,
    "uri": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "your-password-here",
    "schema": {
      "use_test_schema": true,
      "init_script": "test_data/schema_init.cypher"
    },
    "use_test_database": true,
    "test_database": "marvin_test"
  }
}
```

### 4. Implementation Steps

1. **Step 1: Neo4j Connection**
   - Implement driver initialization
   - Configure authentication
   - Add connection validation

2. **Step 2: Test Database Management**
   - Add option to use separate test database
   - Implement database creation/selection
   - Add proper database cleanup

3. **Step 3: Schema Initialization**
   - Create test-specific schema script
   - Implement schema validation
   - Add schema cleanup mechanism

4. **Step 4: Test Data Management**
   - Implement Cypher script loading
   - Create JSON data loading utility
   - Add data cleanup between tests

5. **Step 5: Initial Testing**
   - Create a minimal test case
   - Validate connection and database selection
   - Verify schema initialization
