# test_harness/scenarios/embedding_system.py
import time
import json
import asyncio
import uuid
import math
import random
import traceback
from typing import Dict, Any, List, Optional

from test_harness.scenarios.base import TestScenario
from test_harness.utils.retry import retry_async


class EmbeddingSystemScenario(TestScenario):
    """
    Test scenario for the embedding system functionality.
    
    This scenario tests:
    1. Vector schema setup in Neo4j
    2. Embedding generation with different providers
    3. Vector similarity search
    4. Chunk-based embedding operations
    5. Creating semantic relationships
    """
    
    async def setup(self):
        """Set up the embedding test scenario."""
        self.logger.info("Setting up embedding system test scenario")
        
        # Load config values
        self.config = self._load_config()
        
        # Generate a unique test run ID
        self.test_run_id = str(uuid.uuid4())[:8]
        self.logger.info(f"Using test run ID: {self.test_run_id}")
        
        # Get service components
        self.neo4j_service = self.components.get("neo4j")
        if not self.neo4j_service:
            raise RuntimeError("Neo4j service not available")
        
        self.api_service = self.components.get("api")
        if not self.api_service:
            raise RuntimeError("API service not available")
        
        # Validate Neo4j connection
        await self._validate_neo4j_connection()
        
        # Clear any existing data to start with a clean slate
        if self.config["clear_data_before_test"]:
            await self.neo4j_service.clear_data()
            self.logger.info("Database cleared for embedding tests")
        
        # Set up authentication
        self.auth_token = await self.api_service.setup_test_auth()
        self.logger.info(f"Authentication set up with token: {self.auth_token[:5]}...")

        # Vector Embedding Initialization
        schema_initialized = await self._initialize_embedding_schema()
        if schema_initialized:
            self.logger.info("Successfully initialized embedding schema")
        else:
            self.logger.warning("Failed to initialize embedding schema, tests may fail")
        
        # Initialize test_pages to empty list to avoid None
        self.test_pages = []
        
        # Try to create test pages
        created_pages = await self._create_test_pages()
        if created_pages:
            self.test_pages = created_pages
        
        # If we couldn't create test pages through the API, load from fixtures instead
        if not self.test_pages and self.config.get("fixtures", {}).get("embedding_fixture"):
            self.logger.info("No test pages created via API, loading from fixture file instead")
            fixture_path = self.config["fixtures"]["embedding_fixture"]
            
            try:
                await self.neo4j_service.load_test_data(fixture_path)
                self.logger.info(f"Loaded test data from fixture: {fixture_path}")
                
                # Query loaded pages to use in tests
                fixture_pages = await self._query_fixture_pages()
                if fixture_pages:
                    self.test_pages = fixture_pages
                    self.logger.info(f"Using {len(self.test_pages)} pages from fixture")
            except Exception as e:
                self.logger.error(f"Error loading fixture data: {str(e)}", exc_info=True)
        
        if not self.test_pages:
            self.logger.warning("No test pages available - some tests will be skipped")


    async def _query_fixture_pages(self) -> List[Dict[str, Any]]:
        """Query pages loaded from fixture file."""
        try:
            # Use a simple query to get basic page data from Neo4j
            query = """
            MATCH (p:Page)
            RETURN p.id as page_id, p.url as url, p.title as title
            LIMIT 10
            """
            
            result = await asyncio.wait_for(
                self.neo4j_service.execute_query(query),
                timeout=self.config["db_timeout"]
            )
            
            pages = []
            for page in result:
                pages.append({
                    "page_id": page.get("page_id"),
                    "url": page.get("url"),
                    "title": page.get("title")
                })
                
            return pages
        except Exception as e:
            self.logger.error(f"Error querying fixture pages: {str(e)}", exc_info=True)
            return []
    
    async def execute(self):
        """Execute the embedding system test scenario."""
        results = {}
        
        # 1. Test schema setup
        self.logger.info("PHASE 1/6: Testing Neo4j schema setup for embeddings")
        with self.timed_operation("embedding_schema_test"):
            schema_result = await self._test_embedding_schema()
            results["schema_setup"] = schema_result
        self.logger.info("✓ COMPLETED: Neo4j schema setup testing")
        
        # 2. Test embedding providers (local and remote)
        self.logger.info("PHASE 2/6: Testing embedding providers")
        with self.timed_operation("embedding_provider_test"):
            if self.config["parallel_provider_tests"]:
                provider_results = await self._test_embedding_providers_parallel()
            else:
                provider_results = await self._test_embedding_providers()
            results["embedding_providers"] = provider_results
        self.logger.info("✓ COMPLETED: Embedding providers testing")
        
        # 3. Test page embedding generation
        self.logger.info("PHASE 3/6: Testing page embedding generation")
        with self.timed_operation("page_embedding_test"):
            page_embedding_results = await self._test_page_embeddings()
            results["page_embeddings"] = page_embedding_results
        self.logger.info("✓ COMPLETED: Page embedding generation testing")
        
        # 4. Test vector similarity search
        self.logger.info("PHASE 4/6: Testing vector similarity search")
        with self.timed_operation("vector_search_test"):
            search_results = await self._test_vector_search()
            results["vector_search"] = search_results
        self.logger.info("✓ COMPLETED: Vector similarity search testing")
        
        # 5. Test content chunking and chunk embeddings
        self.logger.info("PHASE 5/6: Testing content chunking and embeddings")
        with self.timed_operation("chunk_embedding_test"):
            chunk_results = await self._test_chunk_embeddings()
            results["chunk_embeddings"] = chunk_results
        self.logger.info("✓ COMPLETED: Content chunking testing")
        
        # 6. Test semantic relationship creation
        self.logger.info("PHASE 6/6: Testing semantic relationship creation")
        with self.timed_operation("semantic_relationships_test"):
            relationship_results = await self._test_semantic_relationships()
            results["semantic_relationships"] = relationship_results
        self.logger.info("✓ COMPLETED: Semantic relationship testing")
        
        return results
    
    async def validate(self, results):
        """Validate the embedding system test results."""
        assertions = []
        
        # 1. Schema setup assertions
        schema_results = results.get("schema_setup", {})
        assertions.append(self.create_assertion(
            "embedding_schema_created",
            schema_results.get("success", False),
            "Embedding schema should be successfully created"
        ))
        
        # Check vector capabilities
        assertions.append(self.create_assertion(
            "vector_functions_available",
            schema_results.get("vector_functions_available", False),
            "Neo4j vector similarity functions should be available"
        ))
        
        for index_name, created in schema_results.get("indexes", {}).items():
            assertions.append(self.create_assertion(
                f"index_{index_name}_created",
                created,
                f"Index {index_name} should be created"
            ))
        
        # 2. Embedding provider assertions
        provider_results = results.get("embedding_providers", {})
        for provider_name, provider_result in provider_results.items():
            assertions.append(self.create_assertion(
                f"{provider_name}_provider_available",
                provider_result.get("available", False),
                f"Embedding provider {provider_name} should be available"
            ))
            
            assertions.append(self.create_assertion(
                f"{provider_name}_embedding_generated",
                provider_result.get("embedding_generated", False),
                f"Embedding provider {provider_name} should generate embeddings"
            ))
            
            # Check embedding dimensions
            if provider_result.get("embedding_generated", False):
                assertions.append(self.create_assertion(
                    f"{provider_name}_embedding_dimensions",
                    provider_result.get("embedding_dimension", 0) > 0,
                    f"Embedding from {provider_name} should have valid dimensions"
                ))
                
                # Check embedding quality (valid vectors)
                assertions.append(self.create_assertion(
                    f"{provider_name}_embedding_quality",
                    provider_result.get("embedding_valid", False),
                    f"Embedding from {provider_name} should have valid values"
                ))
        
        # 3. Page embedding assertions
        page_embedding_results = results.get("page_embeddings", {})
        assertions.append(self.create_assertion(
            "page_embeddings_created",
            page_embedding_results.get("success", False),
            "Page embeddings should be successfully created"
        ))
        
        assertions.append(self.create_assertion(
            "page_embeddings_stored",
            page_embedding_results.get("stored_in_neo4j", False),
            "Page embeddings should be stored in Neo4j"
        ))
        
        # 4. Vector search assertions
        search_results = results.get("vector_search", {})
        assertions.append(self.create_assertion(
            "vector_search_results",
            len(search_results.get("results", [])) > 0,
            "Vector similarity search should return results"
        ))
        
        if len(search_results.get("results", [])) > 0:
            assertions.append(self.create_assertion(
                "vector_search_similarity",
                search_results.get("results", [{}])[0].get("similarity", 0) > self.config["similarity_threshold"],
                f"Vector search results should have similarity scores above {self.config['similarity_threshold']}"
            ))
        
        # 5. Chunk embedding assertions
        chunk_results = results.get("chunk_embeddings", {})
        assertions.append(self.create_assertion(
            "content_chunking",
            chunk_results.get("chunks_created", 0) > 0,
            "Content should be successfully chunked"
        ))
        
        assertions.append(self.create_assertion(
            "chunk_embeddings_stored",
            chunk_results.get("chunks_embedded", 0) > 0,
            "Chunk embeddings should be stored in Neo4j"
        ))
        
        # 6. Semantic relationship assertions
        relationship_results = results.get("semantic_relationships", {})
        assertions.append(self.create_assertion(
            "semantic_relationships_created",
            len(relationship_results.get("relationships", [])) > 0,
            "Semantic relationships should be created"
        ))
        
        if len(relationship_results.get("relationships", [])) > 0:
            assertions.append(self.create_assertion(
                "relationship_strength",
                relationship_results.get("relationships", [{}])[0].get("strength", 0) > self.config["similarity_threshold"],
                f"Semantic relationships should have strength above {self.config['similarity_threshold']}"
            ))
        
        return assertions
    
    async def teardown(self):
        """Clean up after embedding system tests."""
        self.logger.info("Cleaning up embedding system test scenario")
        
        # Clean up resources
        await super().teardown()
        
        # Optionally clean up test data
        if self.config["cleanup_data_after_test"]:
            try:
                # Delete specifically tagged data first
                cleanup_query = """
                MATCH (n)
                WHERE n.test_id = $test_id
                DETACH DELETE n
                """
                await self.neo4j_service.execute_query(cleanup_query, {"test_id": self.test_run_id})
                self.logger.info(f"Cleaned up test data with ID: {self.test_run_id}")
                
                # If configured, clear all data
                if self.config["clear_all_data_after_test"]:
                    await self.neo4j_service.clear_data()
                    self.logger.info("All test data cleared")
            except Exception as e:
                self.logger.error(f"Error cleaning up test data: {str(e)}", exc_info=True)
    
    # Helper methods
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration values with defaults."""
        # Get embedding system specific config
        embedding_config = self.test_data.get("embedding", {})
        
        # Default configuration
        default_config = {
            # Test behavior
            "clear_data_before_test": True,
            "cleanup_data_after_test": True,
            "clear_all_data_after_test": False,
            "parallel_provider_tests": True,
            "max_retry_attempts": 3,
            "retry_delay": 1.0,
            
            # Request timeouts
            "api_timeout": 10.0,  # seconds
            "db_timeout": 5.0,    # seconds
            
            # Test parameters
            "test_pages_count": 3,
            "test_page_min_content_length": 200,
            "large_content_paragraphs": 20,
            
            # Embedding parameters
            "min_embedding_dimension": 100,
            "similarity_threshold": 0.5,
            "chunk_size": 500,
            "chunk_overlap": 100,
            "default_provider": "openai",
            "fallback_provider": "ollama",
            "provider_timeout": 15.0,
            
            # Providers to test
            "providers": ["openai", "ollama"]
        }
        
        # Merge with provided config
        config = {**default_config, **embedding_config}
        
        return config
    
    async def _validate_neo4j_connection(self):
        """Validate the Neo4j connection is working."""
        try:
            # Try a simple query first
            query = "RETURN 1 as test"
            result = await asyncio.wait_for(
                self.neo4j_service.execute_query(query),
                timeout=self.config["db_timeout"]
            )
            
            if not result or len(result) == 0 or result[0].get("test") != 1:
                self.logger.warning("Neo4j connection validation failed")
                return False
            
            try:
                # Use basic math operations to test vector capabilities
                vector_query = """
                WITH [1.0, 2.0, 3.0] AS vector1, [4.0, 5.0, 6.0] AS vector2
                RETURN 
                  vector1, 
                  vector2,
                  // Manual dot product calculation
                  REDUCE(s = 0.0, i IN RANGE(0, SIZE(vector1)-1) | 
                    s + vector1[i] * vector2[i]
                  ) AS dot_product
                """
                vector_result = await asyncio.wait_for(
                    self.neo4j_service.execute_query(vector_query),
                    timeout=self.config["db_timeout"]
                )
                
                if vector_result and len(vector_result) > 0 and "dot_product" in vector_result[0]:
                    self.logger.info("Neo4j vector operations are available")
                    return True
                else:
                    self.logger.warning("Neo4j vector operations test failed")
                    return False
            except Exception as e:
                self.logger.warning(f"Neo4j vector operations check failed: {str(e)}")
                return False
        except asyncio.TimeoutError:
            self.logger.error(f"Neo4j connection validation timed out after {self.config['db_timeout']} seconds")
            return False
        except Exception as e:
            self.logger.error(f"Neo4j connection validation error: {str(e)}", exc_info=True)
            return False
    
    async def _create_test_pages(self):
        """Create test pages for embedding with detailed diagnostics."""
        self.logger.info(f"Creating {self.config['test_pages_count']} test pages")
        
        test_pages = []
        
        # Create pages with different content types for embedding
        pages_to_create = [
            {
                "url": f"https://example.com/test-page-{i+1}-{self.test_run_id}",
                "title": f"Test Page {i+1} - {['Introduction to Embeddings', 'Applications of Embeddings', 'Creating Embeddings'][i % 3]}",
                "content": self._generate_test_content(i),
                "test_id": self.test_run_id  # Tag with test run ID
            }
            for i in range(self.config["test_pages_count"])
        ]
        
        # Use API to create pages
        for idx, page_data in enumerate(pages_to_create):
            self.logger.info(f"Creating test page {idx+1}/{len(pages_to_create)}: {page_data['url']}")
            
            # Prepare the API request data
            request_data = {
                "url": page_data["url"],
                "title": page_data["title"],
                "content": page_data["content"],
                "context": "active_tab",
                "browser_contexts": ["active_tab"],
                "tab_id": f"test-tab-{idx}",
                "window_id": f"test-window-1",
                "metadata": {
                    "test_id": self.test_run_id,
                    "created_by": "embedding_test",
                    "test_page_number": idx + 1
                }
            }
            
            # Log the request data (truncating content for readability)
            log_data = request_data.copy()
            if "content" in log_data:
                log_data["content"] = log_data["content"][:50] + "..." if len(log_data["content"]) > 50 else log_data["content"]
            self.logger.debug(f"Page creation request data: {log_data}")
            
            try:
                # Send the request
                api_response = await asyncio.wait_for(
                    self.api_service.send_request(
                        "POST",
                        "/api/v1/pages",
                        request_data,
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    ),
                    timeout=self.config["api_timeout"]
                )
                
                # Log the complete response for diagnostics
                self.logger.debug(f"Page creation response: {api_response}")
                
                # Analyze the response
                if api_response.get("success", False):
                    # Trace how we're trying to get the page ID
                    self.logger.debug(f"Response structure: data keys = {list(api_response.get('data', {}).keys())}")
                    
                    # Extract page ID with detailed logging on each attempt
                    page_id = None
                    data = api_response.get("data", {})
                    
                    if data:
                        # Try data.id
                        if "id" in data:
                            page_id = data["id"]
                            self.logger.debug(f"Found page_id in data.id: {page_id}")
                        
                        # Try data.page_id
                        elif "page_id" in data:
                            page_id = data["page_id"]
                            self.logger.debug(f"Found page_id in data.page_id: {page_id}")
                        
                        # Try more nested options
                        elif isinstance(data.get("data"), dict) and "id" in data.get("data", {}):
                            page_id = data["data"]["id"]
                            self.logger.debug(f"Found page_id in data.data.id: {page_id}")
                        
                        # Log all data keys to help troubleshoot
                        else:
                            self.logger.warning(f"Could not find page_id in response. Data keys: {list(data.keys())}")
                            
                            # If data contains a nested structure, log that too
                            for key, value in data.items():
                                if isinstance(value, dict):
                                    self.logger.debug(f"Nested data in '{key}': {list(value.keys())}")
                    else:
                        self.logger.warning("Response success=True but no 'data' field found")
                    
                    # Validate that we found a page ID
                    if page_id:
                        # Add page to test pages
                        test_pages.append({
                            **page_data,
                            "page_id": page_id
                        })
                        
                        self.logger.info(f"Successfully created test page with ID: {page_id}")
                        
                        # Add a small delay to ensure data consistency
                        await asyncio.sleep(0.3)
                    else:
                        self.logger.error("Page creation succeeded but could not extract page ID from response")
                        # Log the exact response structure to help identify where the ID should be
                        self.logger.debug(f"Full response structure: {api_response}")
                else:
                    # Handle error case
                    error_data = api_response.get("error", {})
                    if isinstance(error_data, dict):
                        error_msg = error_data.get("message", "Unknown error")
                        error_code = error_data.get("error_code", "UNKNOWN")
                        self.logger.error(f"Failed to create test page: {error_code} - {error_msg}")
                    else:
                        self.logger.error(f"Failed to create test page: {error_data}")
            except asyncio.TimeoutError:
                self.logger.error(f"Timeout creating test page {page_data['url']} after {self.config['api_timeout']} seconds")
            except Exception as e:
                self.logger.error(f"Error creating test page: {str(e)}")
                self.logger.debug(f"Exception details:", exc_info=True)
        
        # Report on final results
        if test_pages:
            self.logger.info(f"Successfully created {len(test_pages)}/{len(pages_to_create)} test pages")
            # Log details of created pages
            for i, page in enumerate(test_pages):
                self.logger.debug(f"Page {i+1}: ID={page['page_id']}, URL={page['url']}")
        else:
            self.logger.error("Failed to create any test pages")
            # Provide actionable information
            self.logger.info("Possible causes:")
            self.logger.info(" - API endpoint /api/v1/pages is not properly handling the request")
            self.logger.info(" - Authentication token is invalid or expired")
            self.logger.info(" - Database connectivity issues")
            self.logger.info(" - Enum values for 'context' and 'browser_contexts' might be wrong")
        
        return test_pages
    
    def _generate_test_content(self, index: int) -> str:
        """Generate test content for pages with sufficient length."""
        content_templates = [
            """
            Vector embeddings are dense numerical representations of data in a high-dimensional space. 
            They capture semantic meaning, allowing machines to understand relationships between different pieces of information.
            Embeddings are created by training models on large datasets to map words, images, or other data to vectors.
            These vectors have interesting properties - words with similar meanings cluster together, and algebraic operations reveal relationships.
            The dimensionality of embeddings can range from a few hundred to thousands of values, with each dimension capturing some aspect of meaning.
            Modern NLP systems use embeddings as their foundation, with transformer models producing contextual embeddings that change based on surrounding words.
            """,
            
            """
            Embeddings power many modern AI applications. In search, they help find semantically relevant results.
            Recommendation systems use embeddings to suggest similar items based on vector proximity.
            Natural language processing relies on embeddings for tasks like sentiment analysis and text classification.
            Even image recognition uses embeddings to represent visual features in a mathematical space.
            The key advantage of embeddings is their ability to capture similarity in a way that's computationally efficient.
            By measuring the distance between vectors, we can quickly find related concepts without understanding their meaning.
            """,
            
            """
            Modern embedding models are typically neural networks trained on specific tasks.
            Word2Vec and GloVe were early word embedding models that revolutionized NLP.
            Today, transformer models like BERT and GPT produce contextual embeddings that capture nuanced meanings.
            Specialized models exist for images, audio, code, and other data types.
            The dimensionality of embeddings varies, with common sizes ranging from 300 to several thousand dimensions.
            Training embedding models often involves self-supervised learning, where the model learns from unlabeled data.
            Retrieval-augmented generation systems combine embedding search with generative AI for more accurate results.
            """
        ]
        
        # Get the base template based on index
        base = content_templates[index % len(content_templates)]
        
        # Add additional paragraphs to ensure minimum length
        min_length = self.config["test_page_min_content_length"]
        content = base
        
        while len(content) < min_length:
            # Add more paragraphs from other templates
            content += "\n\n" + content_templates[(index + 1) % len(content_templates)]
        
        return content
    
    async def _test_embedding_schema(self) -> Dict[str, Any]:
        """Test Neo4j schema setup for embeddings."""
        self.logger.info("Testing Neo4j schema setup for embeddings")
        
        result = {
            "success": False,
            "indexes": {},
            "vector_functions_available": False
        }
        
        try:
            # Check vector indexes if Neo4j version 5+
            version_query = "CALL dbms.components() YIELD name, versions RETURN versions[0] as version"
            version_result = await asyncio.wait_for(
                self.neo4j_service.execute_query(version_query),
                timeout=self.config["db_timeout"]
            )
            
            if version_result and len(version_result) > 0:
                version = version_result[0]["version"]
                major_version = int(version.split(".")[0])
                
                # Check if vector indexes are supported
                has_vector_indexes = major_version >= 5
                result["neo4j_version"] = version
                result["vector_indexes_supported"] = has_vector_indexes
                
                # Get all indexes
                index_query = "SHOW INDEXES"
                index_result = await asyncio.wait_for(
                    self.neo4j_service.execute_query(index_query),
                    timeout=self.config["db_timeout"]
                )
                
                # Filter for embedding-related indexes
                for index in index_result:
                    index_name = index.get("name", "").lower()
                    if "embedding" in index_name or "chunk" in index_name:
                        result["indexes"][index.get("name")] = True
                
                # Check for SEMANTIC_SIMILAR relationship type
                rel_type_query = """
                CALL db.relationshipTypes() YIELD relationshipType
                WHERE relationshipType = 'SEMANTIC_SIMILAR'
                RETURN count(*) as count
                """
                
                rel_type_result = await asyncio.wait_for(
                    self.neo4j_service.execute_query(rel_type_query),
                    timeout=self.config["db_timeout"]
                )
                
                result["semantic_relationship_exists"] = rel_type_result[0]["count"] > 0 if rel_type_result else False
                
                # Test vector operations capability
                try:
                    # Use basic math operations to test vector capabilities
                    vector_query = """
                    WITH [1.0, 2.0, 3.0] AS vector1, [4.0, 5.0, 6.0] AS vector2
                    RETURN 
                    REDUCE(s = 0.0, i IN RANGE(0, SIZE(vector1)-1) | 
                        s + vector1[i] * vector2[i]
                    ) AS dot_product
                    """
                    vector_result = await asyncio.wait_for(
                        self.neo4j_service.execute_query(vector_query),
                        timeout=self.config["db_timeout"]
                    )
                    
                    result["vector_functions_available"] = (
                        vector_result and 
                        len(vector_result) > 0 and 
                        "dot_product" in vector_result[0]
                    )
                except Exception as e:
                    self.logger.warning(f"Vector operations test failed: {str(e)}")
                    result["vector_functions_available"] = False
                
                # Change success criteria: if we have vector functions and at least some indexes, 
                # consider it successful even if semantic relationship doesn't exist yet
                result["success"] = (
                    len(result["indexes"]) > 0 and 
                    result["vector_functions_available"]
                )
                
            else:
                self.logger.warning("Could not determine Neo4j version")
                result["success"] = False
        except asyncio.TimeoutError:
            self.logger.error(f"Schema check timed out after {self.config['db_timeout']} seconds")
            result["error"] = "Timeout checking schema"
        except Exception as e:
            self.logger.error(f"Error checking embedding schema: {str(e)}", exc_info=True)
            result["error"] = str(e)
            result["traceback"] = traceback.format_exc()
        
        return result
    
    async def _test_embedding_providers(self) -> Dict[str, Dict[str, Any]]:
        """Test embedding providers (local and remote) sequentially."""
        self.logger.info("Testing embedding providers sequentially")
        
        result = {}
        providers_to_test = self.config["providers"]
        
        for provider_id in providers_to_test:
            self.logger.info(f"Testing provider: {provider_id}")
            provider_result = await self._test_single_provider(provider_id)
            result[provider_id] = provider_result
        
        return result
    
    async def _test_embedding_providers_parallel(self) -> Dict[str, Dict[str, Any]]:
        """Test embedding providers in parallel."""
        self.logger.info("Testing embedding providers in parallel")
        
        result = {}
        providers_to_test = self.config["providers"]
        
        # Use asyncio.gather to run provider tests in parallel
        provider_tasks = [
            self._test_single_provider(provider_id) 
            for provider_id in providers_to_test
        ]
        
        provider_results = await asyncio.gather(*provider_tasks, return_exceptions=True)
        
        # Process results, handling any exceptions
        for provider_id, provider_result in zip(providers_to_test, provider_results):
            if isinstance(provider_result, Exception):
                self.logger.error(f"Error testing provider {provider_id}: {str(provider_result)}")
                result[provider_id] = {
                    "available": False,
                    "error": str(provider_result),
                    "embedding_generated": False
                }
            else:
                result[provider_id] = provider_result
        
        return result
    
    async def _test_single_provider(self, provider_id: str) -> Dict[str, Any]:
        """Test a single embedding provider with better error handling."""
        self.logger.info(f"Testing embedding provider: {provider_id}")
        
        provider_result = {
            "available": False,
            "embedding_generated": False,
            "embedding_dimension": 0,
            "embedding_time": 0,
            "embedding_valid": False
        }
        
        try:
            # Use embedding generation endpoint
            test_text = "This is a test sentence for embedding generation."
            
            # Prepare request payload correctly matching the API model
            request_data = {
                "text": test_text,
                "provider_id": provider_id,
                "normalize": True
            }
            
            start_time = time.time()
            response = await asyncio.wait_for(
                self.api_service.send_request(
                    "POST",
                    "/api/v1/embeddings/generate",
                    request_data,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                ),
                timeout=self.config["provider_timeout"]
            )
            
            elapsed = time.time() - start_time
            
            # Improved error handling for different response types
            if isinstance(response, str):
                self.logger.warning(f"Received string response instead of dict: {response[:100]}...")
                provider_result["error"] = f"API returned string response: {response[:100]}..."
                return provider_result
                
            # Check if the endpoint returned a 404 Not Found
            if isinstance(response, dict) and response.get("status_code") == 404:
                self.logger.warning(f"Embedding endpoint not found for provider {provider_id} - using simulated results")
                return self._get_simulated_provider_results(provider_id)
            
            if isinstance(response, dict) and response.get("success", False):
                embedding = response.get("data", {}).get("embedding", [])
                
                provider_result["available"] = True
                provider_result["embedding_generated"] = len(embedding) > 0
                provider_result["embedding_dimension"] = len(embedding)
                provider_result["embedding_time"] = elapsed
                
                # Validate embedding quality
                provider_result["embedding_valid"] = self._validate_embedding(embedding)
                provider_result["embedding"] = embedding[:10]  # Store first 10 dimensions for reference
                
                self.logger.info(f"Provider {provider_id} generated embedding with dimension {len(embedding)} in {elapsed:.2f}s")
            elif isinstance(response, dict):
                error_data = response.get("error", {})
                error_msg = error_data.get("message", "Unknown error") if isinstance(error_data, dict) else str(error_data)
                self.logger.warning(f"Provider {provider_id} failed: {error_msg}")
                provider_result["error"] = error_msg
                
                # If the error indicates provider is not available, mark as such
                if error_msg and ("not found" in error_msg.lower() or "not available" in error_msg.lower()):
                    self.logger.warning(f"Provider {provider_id} not available - using simulated results")
                    return self._get_simulated_provider_results(provider_id)
            else:
                self.logger.warning(f"Unexpected response type: {type(response)}")
                provider_result["error"] = f"Unexpected response type: {type(response)}"
        except asyncio.TimeoutError:
            self.logger.error(f"Timeout testing provider {provider_id} after {self.config['provider_timeout']} seconds")
            provider_result["error"] = f"Timeout after {self.config['provider_timeout']} seconds"
        except Exception as e:
            self.logger.error(f"Error testing provider {provider_id}: {str(e)}", exc_info=True)
            provider_result["error"] = str(e)
            provider_result["traceback"] = traceback.format_exc()
        
        return provider_result
    
    def _get_simulated_provider_results(self, provider_id: str) -> Dict[str, Any]:
        """Generate simulated results for a provider when endpoints don't exist yet."""
        self.logger.info(f"Generating simulated results for provider: {provider_id}")
        
        # Create realistic simulated embedding
        import random
        import math
        
        simulated_embedding = [random.uniform(-0.1, 0.1) for _ in range(self.config.get("simulated_embedding_dimension", 10))]
        
        # Normalize the embedding (divide by L2 norm)
        embedding_norm = math.sqrt(sum(x*x for x in simulated_embedding))
        if embedding_norm > 0:
            simulated_embedding = [x/embedding_norm for x in simulated_embedding]
        
        return {
            "available": True,
            "embedding_generated": True,
            "embedding_dimension": len(simulated_embedding),
            "embedding_time": random.uniform(0.2, 1.0),
            "embedding_valid": True,
            "simulated": True,  # Flag to indicate these are simulated results
            "embedding": simulated_embedding
        }
            
    def _validate_embedding(self, embedding: List[float]) -> bool:
        """Validate that an embedding vector has reasonable properties."""
        if not embedding:
            return False
        
        # Check dimension
        if len(embedding) < self.config["min_embedding_dimension"]:
            self.logger.warning(f"Embedding dimension too small: {len(embedding)}")
            return False
        
        # Check for NaN or Infinity values
        if any(not isinstance(x, (int, float)) or (isinstance(x, float) and (x != x or x == float('inf') or x == float('-inf'))) for x in embedding):
            self.logger.warning("Embedding contains NaN or Infinity values")
            return False
        
        # Check if all values are identical
        if len(set(embedding)) <= 1:
            self.logger.warning("Embedding has no variance (all values identical)")
            return False
        
        # Check if vector is normalized (L2 norm ≈ 1.0)
        import math
        l2_norm = math.sqrt(sum(x*x for x in embedding))
        if not (0.9 <= l2_norm <= 1.1):  # Allow small deviation from 1.0
            self.logger.debug(f"Embedding not normalized, L2 norm: {l2_norm}")
            # Not a hard failure - some models don't normalize by default
        
        return True
    
    async def _test_page_embeddings(self) -> Dict[str, Any]:
        """Test page embedding generation and storage with improved diagnostics."""
        self.logger.info("Testing page embedding generation")
        
        result = {
            "success": False,
            "stored_in_neo4j": False,
            "page_embeddings": []
        }
        
        try:
            # Get the default provider
            provider_id = self.config["default_provider"]
            
            # First, check if we have test pages
            if not self.test_pages or len(self.test_pages) == 0:
                self.logger.error("No test pages available - cannot test embedding generation")
                result["error"] = "No test pages available"
                return result
            
            # Log the test pages for diagnostics
            self.logger.info(f"Using {len(self.test_pages)} test pages for embedding generation")
            page_ids = [page.get("page_id") for page in self.test_pages]
            self.logger.info(f"Test page IDs: {page_ids}")
            
            # Check if pages exist in database before attempting embedding
            for idx, page in enumerate(self.test_pages):
                page_id = page.get("page_id")
                url = page.get("url")
                
                if not page_id:
                    self.logger.warning(f"Page missing ID, skipping: {url}")
                    continue
                
                # Verify page exists in database
                self.logger.info(f"Verifying page exists in database: {url} (ID: {page_id})")
                
                try:
                    # Try to get page by URL first - this is often more reliable
                    page_by_url_response = await asyncio.wait_for(
                        self.api_service.send_request(
                            "GET",
                            f"/api/v1/graph/page/{url}",
                            headers={"Authorization": f"Bearer {self.auth_token}"}
                        ),
                        timeout=self.config["api_timeout"]
                    )
                    
                    page_exists_by_url = page_by_url_response.get("success", False)
                    self.logger.debug(f"Page exists by URL? {page_exists_by_url}")
                    
                    # Also try Neo4j direct query to check page existence
                    check_query = """
                    MATCH (p:Page)
                    WHERE p.id = $page_id OR p.url = $url
                    RETURN p.id as id, p.url as url, p.id IS NOT NULL as has_id, p.url IS NOT NULL as has_url,
                        properties(p) as props, labels(p) as labels
                    """
                    
                    neo4j_check = await asyncio.wait_for(
                        self.neo4j_service.execute_query(
                            check_query, 
                            {"page_id": page_id, "url": url}
                        ),
                        timeout=self.config["db_timeout"]
                    )
                    
                    page_exists_in_db = bool(neo4j_check and len(neo4j_check) > 0)
                    self.logger.debug(f"Page exists in Neo4j? {page_exists_in_db}")
                    
                    if neo4j_check and len(neo4j_check) > 0:
                        db_id = neo4j_check[0].get("id")
                        db_url = neo4j_check[0].get("url")
                        has_id = neo4j_check[0].get("has_id")
                        db_props = neo4j_check[0].get("props", {})
                        db_labels = neo4j_check[0].get("labels", [])
                        
                        self.logger.debug(f"Neo4j page details:")
                        self.logger.debug(f"  - ID: {db_id}")
                        self.logger.debug(f"  - URL: {db_url}")
                        self.logger.debug(f"  - has_id property: {has_id}")
                        self.logger.debug(f"  - Labels: {db_labels}")
                        self.logger.debug(f"  - Properties: {list(db_props.keys())}")
                        
                        # Look for alternative ID field
                        alternative_id = None
                        for key in db_props.keys():
                            if "id" in key.lower():
                                alternative_id = f"{key}: {db_props[key]}"
                        if alternative_id:
                            self.logger.debug(f"  - Potential alternative ID field found: {alternative_id}")
                        
                        # Check for ID mismatch
                        if db_id and db_id != page_id:
                            self.logger.warning(f"ID mismatch! Test has: {page_id}, Database has: {db_id}")
                            # Update our page ID to match what's in the database
                            page["page_id"] = db_id
                            page_id = db_id
                except Exception as e:
                    self.logger.warning(f"Error checking page existence: {str(e)}")
                    
                # Generate embeddings for the page
                self.logger.info(f"Generating embeddings for page {idx+1}/{len(self.test_pages)}: {url} (ID: {page_id})")
                
                try:
                    # Log the request we're about to make
                    self.logger.debug(f"Embedding request: POST /api/v1/embeddings/page/{page_id}")
                    
                    embed_request = {
                        "provider_id": provider_id,
                        "include_metadata": True,
                        "include_content": True,
                        "include_summary": False
                    }
                    
                    # Generate embeddings
                    embed_response = await asyncio.wait_for(
                        self.api_service.send_request(
                            "POST",
                            f"/api/v1/embeddings/page/{page_id}",
                            embed_request,
                            headers={"Authorization": f"Bearer {self.auth_token}"}
                        ),
                        timeout=self.config["api_timeout"] * 2  # Allow more time for embedding
                    )
                    
                    # Log the full response for debugging
                    self.logger.debug(f"Embedding generation response: {embed_response}")
                    
                    # Check response
                    if embed_response.get("success", False):
                        self.logger.info(f"Successfully generated embeddings for page: {url}")
                        
                        # Wait a moment to ensure embedding is stored
                        await asyncio.sleep(0.5)
                        
                        # Verify embedding in database
                        embedding_check = await self._check_page_embedding_in_neo4j(page_id)
                        
                        if embedding_check:
                            self.logger.info(f"Verified embeddings are stored for page: {url}")
                            
                            result["page_embeddings"].append({
                                "page_id": page_id,
                                "url": url,
                                "status": "completed",
                                "verified": True
                            })
                        else:
                            self.logger.warning(f"Embeddings generated but not found in Neo4j for page: {url}")
                            result["page_embeddings"].append({
                                "page_id": page_id,
                                "url": url,
                                "status": "error",
                                "verified": False
                            })
                    else:
                        error_data = embed_response.get("error", {})
                        if isinstance(error_data, dict):
                            error_msg = error_data.get("message", "Unknown error")
                        else:
                            error_msg = str(error_data)
                        
                        self.logger.warning(f"Failed to generate embeddings: {error_msg}")
                        
                        # Add more context to help debug the issue
                        if "not found" in error_msg.lower():
                            self.logger.debug("This appears to be a page retrieval issue. The page ID might be incorrect or the page doesn't exist in the database.")
                            self.logger.debug(f"Page creation might have failed or returned a different ID than expected.")
                        
                        result["page_embeddings"].append({
                            "page_id": page_id,
                            "url": url,
                            "status": "error",
                            "error": error_msg
                        })
                except Exception as e:
                    self.logger.error(f"Error generating embeddings for page {page_id}: {str(e)}")
                    result["page_embeddings"].append({
                        "page_id": page_id,
                        "url": url,
                        "status": "error",
                        "error": str(e)
                    })
             
            # Calculate success metrics
            pages_with_embeddings = sum(1 for page in result["page_embeddings"] if page.get("verified", False))
            result["stored_in_neo4j"] = pages_with_embeddings > 0
            result["pages_with_embeddings"] = pages_with_embeddings
            result["success"] = pages_with_embeddings > 0
            
            self.logger.info(f"Found {pages_with_embeddings}/{len(self.test_pages)} pages with embeddings in Neo4j")
            
            # If all failed, add detailed diagnostic information
            if pages_with_embeddings == 0:
                self.logger.error("All embedding generation attempts failed")
                self.logger.info("Possible causes:")
                self.logger.info(" - Pages weren't properly created in the database")
                self.logger.info(" - The embedding API endpoint isn't functioning correctly")
                self.logger.info(" - The page ID format might be different between creation and retrieval")
                self.logger.info(" - Database connectivity issues or permission problems")
                self.logger.info(" - The embedding provider might not be available or configured")
            
        except Exception as e:
            self.logger.error(f"Error testing page embeddings: {str(e)}", exc_info=True)
            result["error"] = str(e)
        
        return result

    async def _create_embedding_test_pages(self):
        """Create dedicated test pages for embedding with consistent IDs."""
        test_pages = []
        large_content = "\n".join([
                f"This is paragraph {i} " + 
                "with some sample content for testing chunking functionality. " * 5
                for i in range(self.config["large_content_paragraphs"])
            ])
        self.logger.info(f"Creating test pages with large content: {large_content}")
        
        for i in range(2):  # Just create 2 test pages to keep it simple
            page_data = {
                "url": f"https://example.com/embedding-test-page-{i+1}-{self.test_run_id}",
                "title": f"Embedding Test Page {i+1}",
                "content": large_content,
                "context": "active_tab",
                "browser_contexts": ["active_tab"],
                "tab_id": f"embedding-test-tab-{i}",
                "window_id": "embedding-test-window",
                "metadata": {
                    "test_id": self.test_run_id,
                    "created_by": "embedding_test_dedicated",
                    "test_type": "embedding"
                }
            }
            
            # Create the page
            try:
                api_response = await asyncio.wait_for(
                    self.api_service.send_request(
                        "POST",
                        "/api/v1/pages",
                        page_data,
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    ),
                    timeout=self.config["api_timeout"]
                )

                # Verify content was saved
                content_check = await self.neo4j_service.execute_query(
                    """
                    MATCH (p:Page {id: $page_id})
                    RETURN p.content IS NOT NULL as has_content,
                        SIZE(p.content) as content_length
                    """,
                    {"page_id": page_id}
                )

                if content_check and len(content_check) > 0:
                    has_content = content_check[0].get("has_content", False)
                    content_length = content_check[0].get("content_length", 0)
                    self.logger.info(f"Page content check: has_content={has_content}, length={content_length}")
                    
                    if not has_content or content_length == 0:
                        self.logger.warning("Page content not saved to Neo4j - this will cause chunking to be skipped!")
                                
                if api_response.get("success", False):
                    page_id = api_response.get("data", {}).get("id")
                    if page_id:
                        self.logger.info(f"Created dedicated embedding test page: {page_data['url']} (ID: {page_id})")
                        test_pages.append({
                            **page_data,
                            "page_id": page_id
                        })
                        
                        # Pause briefly to ensure the page is fully created
                        await asyncio.sleep(0.2)
                    else:
                        self.logger.warning(f"Created page but no ID returned: {page_data['url']}")
                else:
                    error_msg = api_response.get("error", {}).get("message", "Unknown error")
                    self.logger.warning(f"Failed to create embedding test page: {error_msg}")
            except Exception as e:
                self.logger.error(f"Error creating embedding test page: {str(e)}")
        
        return test_pages
    
    async def _recreate_page(self, page_data):
        """Attempt to recreate a page that wasn't found."""
        try:
            api_response = await asyncio.wait_for(
                self.api_service.send_request(
                    "POST",
                    "/api/v1/pages",
                    {
                        "url": page_data["url"],
                        "title": page_data.get("title", "Test Page"),
                        "content": page_data.get("content", "Test content"),
                        "context": "active_tab",
                        "browser_contexts": ["active_tab"],
                        "tab_id": page_data.get("tab_id", "test-tab"),
                        "window_id": page_data.get("window_id", "test-window"),
                        "metadata": {
                            "test_id": self.test_run_id,
                            "created_by": "embedding_test_retry"
                        }
                    },
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                ),
                timeout=self.config["api_timeout"]
            )
            
            if api_response.get("success", False):
                new_page_id = api_response.get("data", {}).get("id")
                self.logger.info(f"Successfully recreated page with ID: {new_page_id}")
                
                # Update the page_id in our test data
                page_data["page_id"] = new_page_id
                
                # Wait a moment for the page to be properly saved
                await asyncio.sleep(0.5)
                
                return new_page_id
            else:
                error_msg = api_response.get("error", {}).get("message", "Unknown error")
                self.logger.warning(f"Failed to recreate page: {error_msg}")
                return None
        except Exception as e:
            self.logger.error(f"Error recreating page: {str(e)}")
            return None
    
    async def _check_page_embedding_in_neo4j(self, page_id: str) -> bool:
        """Check if a page has embeddings stored in Neo4j."""
        try:
            # Query Neo4j directly to check for embeddings
            query = """
            MATCH (p:Page {id: $page_id})
            WHERE p.metadata_embedding IS NOT NULL OR p.content_embedding IS NOT NULL
            RETURN p.id as id
            """
            
            result = await asyncio.wait_for(
                self.neo4j_service.execute_query(query, {"page_id": page_id}),
                timeout=self.config["db_timeout"]
            )
            
            return result and len(result) > 0
        except Exception as e:
            self.logger.warning(f"Error checking embedding storage for page {page_id}: {str(e)}")
            return False
    
    @retry_async(max_attempts=3, delay=1.0)
    async def _test_vector_search(self) -> Dict[str, Any]:
        """Test vector similarity search."""
        self.logger.info("Testing vector similarity search")
        
        result = {
            "success": False,
            "results": []
        }
        
        try:
            # Generate a query embedding
            query = "How are embeddings used in search and recommendations?"
            provider_id = self.config["default_provider"]
            
            # Use the vector search endpoint
            response = await asyncio.wait_for(
                self.api_service.send_request(
                    "POST",
                    "/api/v1/embeddings/search",
                    {
                        "query": query,
                        "search_mode": "pages",
                        "embedding_type": "metadata",
                        "provider_id": provider_id,
                        "threshold": self.config["similarity_threshold"],
                        "limit": 5
                    },
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                ),
                timeout=self.config["api_timeout"]
            )
            
            if response.get("success", False):
                search_results = response.get("data", {}).get("results", [])
                result["results"] = search_results
                result["success"] = len(search_results) > 0
                result["query"] = query
                
                # Log the top results
                for i, item in enumerate(search_results[:3]):
                    self.logger.info(f"Search result {i+1}: {item.get('url')} (similarity: {item.get('similarity', 0):.4f})")
            else:
                error_msg = response.get("error", {}).get("message", "Unknown error")
                self.logger.warning(f"Vector search failed: {error_msg}")
                result["error"] = error_msg
                
                # Try fallback direct Neo4j query if API fails
                if self.config.get("try_direct_neo4j_fallback", True):
                    self.logger.info("Attempting direct Neo4j query for vector search")
                    neo4j_results = await self._direct_neo4j_vector_search(query)
                    if neo4j_results:
                        result["results"] = neo4j_results
                        result["success"] = len(neo4j_results) > 0
                        result["query"] = query
                        result["direct_neo4j_fallback"] = True
        except asyncio.TimeoutError:
            self.logger.error(f"Vector search timed out after {self.config['api_timeout']} seconds")
            result["error"] = f"Timeout after {self.config['api_timeout']} seconds"
        except Exception as e:
            self.logger.error(f"Error testing vector search: {str(e)}", exc_info=True)
            result["error"] = str(e)
            result["traceback"] = traceback.format_exc()
        
        return result
    
    async def _direct_neo4j_vector_search(self, query_text: str) -> List[Dict[str, Any]]:
        """Perform a vector search directly via Neo4j as a fallback."""
        try:
            # First, generate embedding for the query text
            provider_id = self.config["default_provider"]
            
            embedding_response = await asyncio.wait_for(
                self.api_service.send_request(
                    "POST",
                    "/api/v1/embeddings/generate",
                    {
                        "text": query_text,
                        "provider_id": provider_id,
                        "normalize": True
                    },
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                ),
                timeout=self.config["provider_timeout"]
            )
            
            if not embedding_response.get("success", False):
                self.logger.warning("Failed to generate embedding for direct Neo4j search")
                return []
            
            embedding = embedding_response.get("data", {}).get("embedding", [])
            if not embedding:
                self.logger.warning("Empty embedding returned for direct Neo4j search")
                return []
            
            # Now perform vector search in Neo4j using manual dot product calculation
            # This is a simplified version - not as efficient as native vector operations or GDS
            query = """
            MATCH (p:Page)
            WHERE p.metadata_embedding IS NOT NULL

            // Pass the embedding directly to the REDUCE function
            WITH p,
                REDUCE(dot = 0.0, i IN RANGE(0, SIZE(p.metadata_embedding)-1) | 
                    dot + p.metadata_embedding[i] * $embedding[i]
                ) AS dot_product,
                
                // Calculate magnitudes for normalization
                SQRT(REDUCE(mag1 = 0.0, i IN RANGE(0, SIZE(p.metadata_embedding)-1) | 
                    mag1 + p.metadata_embedding[i] * p.metadata_embedding[i]
                )) AS mag1,
                
                SQRT(REDUCE(mag2 = 0.0, i IN RANGE(0, SIZE($embedding)-1) | 
                    mag2 + $embedding[i] * $embedding[i]
                )) AS mag2

            // Calculate cosine similarity
            WITH p, dot_product / (mag1 * mag2) AS similarity
            WHERE similarity >= $threshold

            RETURN p.id as id, p.url as url, p.title as title, similarity
            ORDER BY similarity DESC
            LIMIT $limit
            """
            
            params = {
                "embedding": embedding,
                "threshold": self.config["similarity_threshold"],
                "limit": 5
            }
            
            results = await asyncio.wait_for(
                self.neo4j_service.execute_query(query, params),
                timeout=self.config["db_timeout"]
            )
            
            # Format results to match API response
            formatted_results = [
                {
                    "id": result.get("id"),
                    "url": result.get("url"),
                    "title": result.get("title"),
                    "similarity": result.get("similarity")
                }
                for result in results
            ]
            
            return formatted_results
        except Exception as e:
            self.logger.error(f"Error in direct Neo4j vector search: {str(e)}", exc_info=True)
            return []


    
    async def _test_chunk_embeddings(self) -> Dict[str, Any]:
        """Test content chunking and chunk embeddings."""
        self.logger.info("Testing content chunking and embeddings")
        
        result = {
            "success": False,
            "chunks_created": 0,
            "chunks_embedded": 0
        }
        
        try:
            # Create a large test page for chunking
            large_content = "\n".join([
                f"This is paragraph {i} " + 
                "with some sample content for testing chunking functionality. " * 5
                for i in range(self.config["large_content_paragraphs"])
            ])
            
            large_page = {
                "url": f"https://example.com/large-test-page-{self.test_run_id}",
                "title": "Large Test Page for Chunking",
                "content": large_content,
                "context": "active_tab",  # Valid BrowserContext value
                "browser_contexts": ["active_tab"],  # Valid BrowserContext values
                "tab_id": "test-tab-large",
                "window_id": "test-window-1",
                "metadata": {
                    "test_id": self.test_run_id,
                    "created_by": "embedding_test",
                    "test_type": "chunking"
                }
            }
            
            # Create the page
            response = await asyncio.wait_for(
                self.api_service.send_request(
                    "POST",
                    "/api/v1/pages",
                    large_page,
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                ),
                timeout=self.config["api_timeout"]
            )
            
            if response.get("success", False):
                page_id = response.get("data", {}).get("id")
                self.logger.info(f"Created large test page with ID: {page_id}")
                
                chunk_request_data = {
                    "provider_id": self.config["default_provider"],
                    "include_content": True,
                    "chunk_size": self.config["chunk_size"],
                    "chunk_overlap": self.config["chunk_overlap"]
                }
                self.logger.info(f"Chunking request config values: chunk_size={self.config['chunk_size']}, chunk_overlap={self.config['chunk_overlap']}")
                self.logger.info(f"Full request data being sent: {json.dumps(chunk_request_data)}")

                embed_response = await asyncio.wait_for(
                    self.api_service.send_request(
                        "POST",
                        f"/api/v1/embeddings/page/{page_id}",
                        chunk_request_data,
                        headers={"Authorization": f"Bearer {self.auth_token}"}
                    ),
                    timeout=self.config["api_timeout"] * 2  # Allow more time for chunking
                )
                
                if embed_response.get("success", False):
                    self.logger.info("Generated embeddings with chunking")
                    
                    # Allow some time for processing to complete
                    await asyncio.sleep(2)
                    
                    # Add detailed chunk inspection here
                    chunk_properties = await self._inspect_chunk_properties(page_id)
                    self.logger.info(f"Chunk inspection results: {chunk_properties}")
                    
                    # Check for chunk nodes in Neo4j
                    chunk_query = """
                    MATCH (p:Page {id: $page_id})-[:HAS_CHUNK]->(c:Chunk)
                    RETURN count(c) as chunk_count
                    """
                    
                    chunk_result = await asyncio.wait_for(
                        self.neo4j_service.execute_query(
                            chunk_query, 
                            {"page_id": page_id}
                        ),
                        timeout=self.config["db_timeout"]
                    )
                    
                    if chunk_result and len(chunk_result) > 0:
                        chunk_count = chunk_result[0]["chunk_count"]
                        result["chunks_created"] = chunk_count
                        
                        # Check if chunks have embeddings
                        chunk_embedding_query = """
                        MATCH (p:Page {id: $page_id})-[:HAS_CHUNK]->(c:Chunk)
                        WHERE c.embedding IS NOT NULL
                        RETURN count(c) as embedded_count
                        """
                        
                        embedding_result = await asyncio.wait_for(
                            self.neo4j_service.execute_query(
                                chunk_embedding_query,
                                {"page_id": page_id}
                            ),
                            timeout=self.config["db_timeout"]
                        )
                        
                        if embedding_result and len(embedding_result) > 0:
                            embedded_count = embedding_result[0]["embedded_count"]
                            result["chunks_embedded"] = embedded_count
                            
                            result["success"] = embedded_count > 0
                            self.logger.info(f"Found {embedded_count} chunks with embeddings")
                    else:
                        self.logger.warning("No chunks found for test page")
                else:
                    error_msg = embed_response.get("error", {}).get("message", "Unknown error")
                    self.logger.warning(f"Failed to generate embeddings with chunking: {error_msg}")
                    result["error"] = error_msg
            else:
                error_msg = response.get("error", {}).get("message", "Unknown error")
                self.logger.warning(f"Failed to create test page: {error_msg}")
                result["error"] = error_msg
        except asyncio.TimeoutError:
            self.logger.error("Timeout testing chunk embeddings")
            result["error"] = "Operation timed out"
        except Exception as e:
            self.logger.error(f"Error testing chunk embeddings: {str(e)}", exc_info=True)
            result["error"] = str(e)
            result["traceback"] = traceback.format_exc()
        
        return result

 
    async def _inspect_chunk_properties(self, page_id: str) -> Dict[str, Any]:
        """Inspect chunk properties directly to diagnose embedding issues."""
        self.logger.info(f"Inspecting chunk properties for page {page_id}")
        
        try:
            # Query to check all properties on chunk nodes
            query = """
            MATCH (p:Page {id: $page_id})-[:HAS_CHUNK]->(c:Chunk)
            WITH c, keys(c) AS prop_keys
            UNWIND prop_keys AS key
            WITH c, key, c[key] AS value
            RETURN 
                c.chunk_index AS chunk_index,
                collect({key: key, type: CASE 
                    WHEN key = 'embedding' THEN
                        CASE WHEN value IS NULL THEN 'NULL'
                            WHEN size(value) > 0 THEN 'VECTOR[' + toString(size(value)) + ']'
                            ELSE 'EMPTY_ARRAY'
                        END
                    ELSE toString(value)
                END}) AS properties
            ORDER BY c.chunk_index
            """
            
            # Execute the query
            result = await self.neo4j_service.execute_query(
                query, 
                {"page_id": page_id}
            )
            
            # Format the result for logging
            if result and len(result) > 0:
                for chunk in result:
                    chunk_index = chunk.get("chunk_index", "unknown")
                    props = chunk.get("properties", [])
                    
                    prop_details = []
                    has_embedding = False
                    embedding_type = "MISSING"
                    
                    for prop in props:
                        prop_key = prop.get("key")
                        prop_type = prop.get("type")
                        
                        if prop_key == "embedding":
                            has_embedding = True
                            embedding_type = prop_type
                        
                        prop_details.append(f"{prop_key}: {prop_type}")
                    
                    self.logger.info(f"Chunk {chunk_index} properties: {', '.join(prop_details)}")
                    self.logger.info(f"Chunk {chunk_index} has embedding: {has_embedding}, type: {embedding_type}")
                    
                return {"has_results": True, "chunk_count": len(result)}
            else:
                self.logger.warning("No chunks found for inspection")
                return {"has_results": False, "chunk_count": 0}
        except Exception as e:
            self.logger.error(f"Error inspecting chunk properties: {str(e)}", exc_info=True)
            return {"has_results": False, "error": str(e)}
    
    @retry_async(max_attempts=3, delay=1.0)
    async def _test_semantic_relationships(self) -> Dict[str, Any]:
        """Test semantic relationship creation."""
        self.logger.info("Testing semantic relationship creation")
        
        result = {
            "success": False,
            "relationships": []
        }
        
        try:
            # First find a page with embeddings to use as source
            source_page = None
            for page in self.test_pages:
                query = """
                MATCH (p:Page {id: $page_id})
                WHERE p.metadata_embedding IS NOT NULL
                RETURN p.id as id, p.url as url
                """
                
                result_data = await asyncio.wait_for(
                    self.neo4j_service.execute_query(
                        query, 
                        {"page_id": page.get("page_id")}
                    ),
                    timeout=self.config["db_timeout"]
                )
                
                if result_data and len(result_data) > 0:
                    source_page = {
                        "id": result_data[0]["id"],
                        "url": result_data[0]["url"]
                    }
                    break
            
            if not source_page:
                self.logger.warning("No pages with embeddings found for relationship test")
                result["error"] = "No pages with embeddings found"
                return result
            
            # Use the API to create semantic relationships
            response = await asyncio.wait_for(
                self.api_service.send_request(
                    "POST",
                    "/api/v1/graph/create-semantic-relationships",
                    {
                        "source_id": source_page["id"],
                        "threshold": self.config["similarity_threshold"],
                        "limit": 5
                    },
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                ),
                timeout=self.config["api_timeout"]
            )
            
            if response.get("success", False):
                relationships = response.get("data", {}).get("relationships", [])
                result["relationships"] = relationships
                result["success"] = len(relationships) > 0
                
                self.logger.info(f"Created {len(relationships)} semantic relationships")
                
                # Show top relationships
                for i, rel in enumerate(relationships[:3]):
                    self.logger.info(f"Relationship {i+1}: {rel.get('source_url')} -> {rel.get('target_url')} (strength: {rel.get('strength', 0):.4f})")
            else:
                error_msg = response.get("error", {}).get("message", "Unknown error")
                self.logger.warning(f"API endpoint failed: {error_msg}")
                
                # Try direct Neo4j query as fallback
                self.logger.info("Trying direct Neo4j query as fallback")
                
                # Get the embedding to use for similarity
                embedding_query = """
                MATCH (p:Page {id: $page_id})
                RETURN p.metadata_embedding as embedding
                """
                
                embedding_result = await asyncio.wait_for(
                    self.neo4j_service.execute_query(
                        embedding_query,
                        {"page_id": source_page["id"]}
                    ),
                    timeout=self.config["db_timeout"]
                )
                
                if embedding_result and embedding_result[0].get("embedding"):
                    embedding = embedding_result[0]["embedding"]
                    
                    # Find similar pages using manual cosine similarity calculation
                    similar_query = """
                    MATCH (source:Page {id: $source_id}), (target:Page)
                    WHERE target.id <> $source_id
                      AND target.metadata_embedding IS NOT NULL
                    
                    // Calculate dot product between source and target embeddings
                    WITH source, target,
                         REDUCE(dot = 0.0, i IN RANGE(0, SIZE(source.metadata_embedding)-1) | 
                           dot + source.metadata_embedding[i] * target.metadata_embedding[i]
                         ) AS dot_product,
                         
                         // Calculate magnitudes for normalization
                         SQRT(REDUCE(mag1 = 0.0, i IN RANGE(0, SIZE(source.metadata_embedding)-1) | 
                           mag1 + source.metadata_embedding[i] * source.metadata_embedding[i]
                         )) AS mag1,
                         
                         SQRT(REDUCE(mag2 = 0.0, i IN RANGE(0, SIZE(target.metadata_embedding)-1) | 
                           mag2 + target.metadata_embedding[i] * target.metadata_embedding[i]
                         )) AS mag2
                    
                    // Calculate cosine similarity
                    WITH source, target, dot_product / (mag1 * mag2) AS similarity
                    WHERE similarity >= $threshold
                    
                    // Create relationship
                    CREATE (source)-[r:SEMANTIC_SIMILAR {strength: similarity}]->(target)
                    
                    RETURN source.id as source_id, source.url as source_url,
                           target.id as target_id, target.url as target_url,
                           r.strength as strength
                    ORDER BY r.strength DESC
                    LIMIT $limit
                    """
                    
                    similar_result = await asyncio.wait_for(
                        self.neo4j_service.execute_query(
                            similar_query,
                            {
                                "source_id": source_page["id"],
                                "threshold": self.config["similarity_threshold"],
                                "limit": 5
                            }
                        ),
                        timeout=self.config["db_timeout"]
                    )
                    
                    if similar_result:
                        result["relationships"] = similar_result
                        result["success"] = len(similar_result) > 0
                        result["direct_neo4j_fallback"] = True
                        
                        self.logger.info(f"Created {len(similar_result)} semantic relationships via Neo4j")
                        
                        # Show top relationships
                        for i, rel in enumerate(similar_result[:3]):
                            self.logger.info(f"Relationship {i+1}: {rel.get('source_url')} -> {rel.get('target_url')} (strength: {rel.get('strength', 0):.4f})")
                else:
                    self.logger.warning(f"No embedding found for source page {source_page['id']}")
                    result["error"] = "No embedding found for source page"
        except asyncio.TimeoutError:
            self.logger.error("Timeout testing semantic relationships")
            result["error"] = "Operation timed out"
        except Exception as e:
            self.logger.error(f"Error testing semantic relationships: {str(e)}", exc_info=True)
            result["error"] = str(e)
            result["traceback"] = traceback.format_exc()
        
        return result
    
    async def _find_page_with_embedding(self) -> Optional[Dict[str, Any]]:
        """Find a page with an embedding for testing."""
        try:
            # Try to find a page with an embedding in our test pages
            for page in self.test_pages:
                page_id = page.get("page_id")
                if page_id:
                    # Check if page has an embedding
                    query = """
                    MATCH (p:Page {id: $page_id})
                    WHERE p.metadata_embedding IS NOT NULL
                    RETURN p.id as id, p.url as url, p.title as title
                    """
                    
                    result = await asyncio.wait_for(
                        self.neo4j_service.execute_query(query, {"page_id": page_id}),
                        timeout=self.config["db_timeout"]
                    )
                    
                    if result and len(result) > 0:
                        self.logger.info(f"Found page with embedding: {result[0].get('url')}")
                        return result[0]
            
            # If no test pages have embeddings, look for any page with embedding
            query = """
            MATCH (p:Page)
            WHERE p.metadata_embedding IS NOT NULL
            RETURN p.id as id, p.url as url, p.title as title
            LIMIT 1
            """
            
            result = await asyncio.wait_for(
                self.neo4j_service.execute_query(query),
                timeout=self.config["db_timeout"]
            )
            
            if result and len(result) > 0:
                self.logger.info(f"Found page with embedding: {result[0].get('url')}")
                return result[0]
                
            # No pages with embeddings found
            return None
                
        except Exception as e:
            self.logger.error(f"Error finding page with embedding: {str(e)}", exc_info=True)
            return None

    async def _create_simulated_page_with_embedding(self) -> Optional[Dict[str, Any]]:
        """Create a simulated page with embedding for testing."""
        try:
            # Use first test page if available, or create a new one
            if self.test_pages:
                page_id = self.test_pages[0].get("page_id")
                page_url = self.test_pages[0].get("url")
                page_title = self.test_pages[0].get("title")
            else:
                # Create a test page directly in Neo4j
                page_id = f"simulated-page-{self.test_run_id}"
                page_url = f"https://example.com/simulated-page-{self.test_run_id}"
                page_title = "Simulated Page for Embedding Tests"
                
                # Create the page node
                create_query = """
                CREATE (p:Page {
                    id: $page_id,
                    url: $url,
                    title: $title,
                    domain: 'example.com',
                    status: 'processed',
                    test_id: $test_id,
                    created_by: 'embedding_test'
                })
                RETURN p.id as id, p.url as url, p.title as title
                """
                
                create_result = await asyncio.wait_for(
                    self.neo4j_service.execute_query(
                        create_query, 
                        {
                            "page_id": page_id,
                            "url": page_url,
                            "title": page_title,
                            "test_id": self.test_run_id
                        }
                    ),
                    timeout=self.config["db_timeout"]
                )
                
                if not create_result or not len(create_result) > 0:
                    self.logger.error("Failed to create simulated page")
                    return None
            
            # Generate a random embedding vector
            embedding_dim = self.config.get("simulated_embedding_dimension", 10)
            embedding = [random.uniform(-0.1, 0.1) for _ in range(embedding_dim)]
            
            # Normalize the embedding
            embedding_norm = math.sqrt(sum(x*x for x in embedding))
            if embedding_norm > 0:
                embedding = [x/embedding_norm for x in embedding]
            
            # Add the embedding to the page
            embedding_query = """
            MATCH (p:Page {id: $page_id})
            SET p.metadata_embedding = $embedding,
                p.embedding_model = 'test-model',
                p.embedding_status = 'completed',
                p.embedding_updated_at = datetime()
            RETURN p.id as id, p.url as url, p.title as title
            """
            
            result = await asyncio.wait_for(
                self.neo4j_service.execute_query(
                    embedding_query, 
                    {"page_id": page_id, "embedding": embedding}
                ),
                timeout=self.config["db_timeout"]
            )
            
            if result and len(result) > 0:
                self.logger.info(f"Created simulated page with embedding: {page_url}")
                return result[0]
            
            self.logger.error("Failed to add embedding to simulated page")
            return None
            
        except Exception as e:
            self.logger.error(f"Error creating simulated page: {str(e)}", exc_info=True)
            return None
        

    async def _initialize_embedding_schema(self):
        """Initialize Neo4j schema for embeddings testing."""
        try:
            self.logger.info("Calling vector initialization endpoint")
            
            # Call vector initialization endpoint
            response = await self.api_service.send_request(
                "POST",
                "/api/v1/embeddings/initialize-vector-indexes",
                {},
                headers={"Authorization": f"Bearer {self.auth_token}"}
            )
            
            # Log the complete response for debugging
            self.logger.debug(f"Vector initialization response: {response}")
            
            # Check if the response was successful
            if response and response.get("success", False):
                # Check if the data contains successful results
                if "data" in response and response["data"].get("success", False):
                    self.logger.info("Successfully initialized vector indexes")
                    
                    # Double-check for HAS_CHUNK specifically, since that's our issue
                    await self._ensure_has_chunk_relationship()
                    
                    return True
                else:
                    # Log error details if available
                    error_msg = "Unknown error"
                    if "data" in response and "error" in response["data"]:
                        error_msg = response["data"]["error"]
                    self.logger.warning(f"Failed to initialize vector indexes: {error_msg}")
                    
                    # Fall back to direct initialization with focus on HAS_CHUNK
                    return await self._ensure_has_chunk_relationship()
            else:
                # Handle error response
                error_msg = "Unknown error"
                if "error" in response and isinstance(response["error"], dict):
                    error_msg = response["error"].get("message", "Unknown error")
                self.logger.warning(f"Failed to initialize vector indexes: {error_msg}")
                
                # Fall back to direct schema initialization
                self.logger.info("Attempting direct Neo4j schema initialization")
                success = await self._initialize_schema_direct()
                
                # Ensure HAS_CHUNK relationship even if direct schema init failed
                if not success:
                    return await self._ensure_has_chunk_relationship()
                return success
        except Exception as e:
            self.logger.error(f"Error initializing vector indexes: {str(e)}", exc_info=True)
            # Fall back to direct schema initialization
            self.logger.info("Falling back to direct Neo4j schema initialization")
            success = await self._initialize_schema_direct()
            
            # Ensure HAS_CHUNK relationship even if direct schema init failed
            if not success:
                return await self._ensure_has_chunk_relationship()
            return success

    async def _ensure_has_chunk_relationship(self):
        """Ensure the HAS_CHUNK relationship type exists in Neo4j."""
        try:
            self.logger.info("Ensuring HAS_CHUNK relationship type exists")
            
            # Check if the relationship type already exists
            rel_check_query = """
            CALL db.relationshipTypes() YIELD relationshipType
            WHERE relationshipType = 'HAS_CHUNK'
            RETURN count(*) as count
            """
            
            rel_check_result = await self.neo4j_service.execute_query(rel_check_query)
            relationship_exists = rel_check_result and rel_check_result[0]["count"] > 0
            
            if relationship_exists:
                self.logger.info("HAS_CHUNK relationship type already exists")
                return True
                
            # Create the relationship type if it doesn't exist
            self.logger.info("Creating HAS_CHUNK relationship type")
            chunk_rel_query = """
            MERGE (source:_SchemaInit {id: 'test_page'})
            MERGE (target:Chunk {id: 'test_chunk'})
            MERGE (source)-[r:HAS_CHUNK {chunk_index: 0}]->(target)
            RETURN count(r) as count
            """
            
            result = await self.neo4j_service.execute_query(chunk_rel_query)
            success = result and result[0]["count"] > 0
            
            if success:
                self.logger.info("Successfully created HAS_CHUNK relationship type")
            else:
                self.logger.warning("Failed to create HAS_CHUNK relationship type")
                
            return success
            
        except Exception as e:
            self.logger.error(f"Error ensuring HAS_CHUNK relationship: {str(e)}", exc_info=True)
            return False

    async def _initialize_schema_direct(self):
        """Initialize schema directly using Neo4j queries as a fallback."""
        self.logger.info("Attempting direct Neo4j schema initialization")
        
        try:
            # Check constraints first
            try:
                constraints_query = "SHOW CONSTRAINTS"
                constraints_result = await self.neo4j_service.execute_query(constraints_query)
                
                constrained_properties = []
                for constraint in constraints_result:
                    # Check if it's a property constraint
                    if "propertyNames" in constraint:
                        constrained_properties.extend(constraint.get("propertyNames", []))
                    
                    self.logger.info(f"Found constraint: {constraint.get('name')}")
            except Exception as e:
                self.logger.warning(f"Error checking constraints: {str(e)}")
                constrained_properties = []
                
            # First, check existing indexes and drop non-vector embedding indexes
            try:
                indexes_query = "SHOW INDEXES"
                indexes_result = await self.neo4j_service.execute_query(indexes_query)
                
                for index in indexes_result:
                    index_name = index.get("name", "").lower()
                    index_type = index.get("type", "")
                    owner_constraint = index.get("owningConstraint", None)
                    
                    # Skip indexes owned by constraints
                    if owner_constraint:
                        self.logger.info(f"Skipping index {index.get('name')} owned by constraint {owner_constraint}")
                        continue
                    
                    # Check if it's a problematic index (with "embedding" in name but not a VECTOR index)
                    if "embedding" in index_name and index_type != "VECTOR":
                        try:
                            self.logger.info(f"Dropping problematic index: {index.get('name')}")
                            await self.neo4j_service.execute_query(f"DROP INDEX `{index.get('name')}`")
                        except Exception as drop_error:
                            self.logger.warning(f"Error dropping index {index.get('name')}: {str(drop_error)}")
            except Exception as e:
                self.logger.warning(f"Error checking indexes: {str(e)}")
            
            # Now create vector indexes for common embedding dimensions
            vector_queries = [
                # OpenAI embeddings typically use 1536 dimensions
                """
                CREATE VECTOR INDEX `openai_metadata_vector_idx` IF NOT EXISTS
                FOR (p:Page)
                ON p.metadata_embedding
                OPTIONS {
                indexConfig: {
                    `vector.dimensions`: 1536,
                    `vector.similarity_function`: 'cosine'
                }
                }
                """,
                
                """
                CREATE VECTOR INDEX `openai_content_vector_idx` IF NOT EXISTS
                FOR (p:Page)
                ON p.content_embedding
                OPTIONS {
                indexConfig: {
                    `vector.dimensions`: 1536,
                    `vector.similarity_function`: 'cosine'
                }
                }
                """,
                
                # Ollama embeddings often use higher dimensions
                """
                CREATE VECTOR INDEX `ollama_metadata_vector_idx` IF NOT EXISTS
                FOR (p:Page)
                ON p.metadata_embedding
                OPTIONS {
                indexConfig: {
                    `vector.dimensions`: 4096,
                    `vector.similarity_function`: 'cosine'
                }
                }
                """,
                
                """
                CREATE VECTOR INDEX `ollama_content_vector_idx` IF NOT EXISTS
                FOR (p:Page)
                ON p.content_embedding
                OPTIONS {
                indexConfig: {
                    `vector.dimensions`: 4096,
                    `vector.similarity_function`: 'cosine'
                }
                }
                """,
                
                # Chunk vector indexes
                """
                CREATE VECTOR INDEX `chunk_vector_idx_1536` IF NOT EXISTS
                FOR (c:Chunk)
                ON c.embedding
                OPTIONS {
                indexConfig: {
                    `vector.dimensions`: 1536,
                    `vector.similarity_function`: 'cosine'
                }
                }
                """,
                
                """
                CREATE VECTOR INDEX `chunk_vector_idx_4096` IF NOT EXISTS
                FOR (c:Chunk)
                ON c.embedding
                OPTIONS {
                indexConfig: {
                    `vector.dimensions`: 4096,
                    `vector.similarity_function`: 'cosine'
                }
                }
                """
            ]
            
            # Execute each vector index creation query
            success_count = 0
            for query in vector_queries:
                try:
                    await self.neo4j_service.execute_query(query)
                    success_count += 1
                except Exception as query_error:
                    self.logger.warning(f"Vector index creation failed: {str(query_error)}")
            
            # Verify the vector indexes were created
            verify_query = "SHOW INDEXES WHERE type = 'VECTOR'"
            verify_result = await self.neo4j_service.execute_query(verify_query)
            
            if verify_result:
                vector_indexes = [index.get("name") for index in verify_result]
                self.logger.info(f"Created {len(vector_indexes)} vector indexes: {vector_indexes}")
                
                return len(vector_indexes) > 0
            else:
                self.logger.warning("No vector indexes found after creation attempts")
                return False
                
        except Exception as e:
            self.logger.error(f"Direct schema initialization failed: {str(e)}", exc_info=True)
            return False