# core/services/embeddings/embedding_service.py
from typing import List, Dict, Any, Optional
from datetime import datetime
import time

from core.domain.embeddings.models import (
    EmbeddingVector, EmbeddingStatus, 
    ContentChunk, PageEmbeddings, EmbeddingType,
    EmbeddingRequestConfig
)
from core.infrastructure.embeddings.factory import EmbeddingProviderFactory
from core.services.base import BaseService
from core.services.graph.graph_service import GraphService
from core.infrastructure.database.db_connection import DatabaseConnection
from core.infrastructure.database.transactions import Transaction
from core.utils.logger import get_logger

class EmbeddingService(BaseService):
    """Service for managing embeddings generation and retrieval."""
    
    def __init__(self, provider_factory: EmbeddingProviderFactory, graph_service: GraphService):
        """
        Initialize the embedding service.
        
        Args:
            provider_factory: Factory for embedding providers
            graph_service: GraphService for storing embeddings
        """
        try:
            super().__init__()  # Call BaseService init
            self.provider_factory = provider_factory
            self.graph_service = graph_service
            self.logger = get_logger(__name__)
            self.logger.info("Embedding service initialized")
        except Exception as e:
            self.logger.error(f"Error initializing EmbeddingService: {str(e)}", exc_info=True)
            raise
    
    async def get_embedding(self, text: str, config: EmbeddingRequestConfig = None) -> EmbeddingVector:
        """
        Get embedding for a text string.
        
        Args:
            text: Text to embed
            config: Optional embedding configuration
            
        Returns:
            EmbeddingVector object
        """
        try:
            # Use default config if not provided
            if config is None:
                config = EmbeddingRequestConfig()
            
            self.logger.debug(f"Getting embedding for text (length: {len(text)}) with config: {config.model_id}")
            start_time = time.time()
                
            # Get provider
            provider = await self.provider_factory.get_provider(config.provider_id)
            
            # Generate embedding
            embedding = await provider.get_embedding(text, model = getattr(config.model_id, 'value', None) if config.model_id else None)
            
            # Normalize if requested
            if config.normalize and not embedding.normalized:
                self.logger.debug("Normalizing embedding vector")
                embedding = embedding.normalize()
            
            elapsed = time.time() - start_time
            self.logger.debug(f"Generated embedding in {elapsed:.2f}s")
                
            return embedding
        except Exception as e:
            self.logger.error(f"Error getting embedding: {str(e)}", exc_info=True)
            # Return a default embedding vector with zeros
            return EmbeddingVector(
                vector=[0.0] * 1536,  # Default size for many embedding models
                model=config.model_id if config else "default",
                normalized=False
            )
    
    async def batch_embed(self, texts: List[str], config: EmbeddingRequestConfig = None) -> List[EmbeddingVector]:
        """
        Get embeddings for multiple text strings.
        
        Args:
            texts: List of texts to embed
            config: Optional embedding configuration
            
        Returns:
            List of EmbeddingVector objects
        """
        try:
            # Use default config if not provided
            if config is None:
                config = EmbeddingRequestConfig()
            
            self.logger.debug(f"Batch embedding {len(texts)} texts with config: {config.model_id}")
            start_time = time.time()
                
            # Get provider
            provider = await self.provider_factory.get_provider(config.provider_id)
            
            # Generate embeddings
            embeddings = await provider.batch_embed(texts, model = getattr(config.model_id, 'value', None) if config.model_id else None)
            
            # Normalize if requested
            if config.normalize:
                embeddings = [emb.normalize() if not emb.normalized else emb for emb in embeddings]
            
            elapsed = time.time() - start_time
            self.logger.debug(f"Generated {len(embeddings)} embeddings in {elapsed:.2f}s")
                
            return embeddings
        except Exception as e:
            self.logger.error(f"Error batch embedding texts: {str(e)}", exc_info=True)
            # Return a list of default embedding vectors
            return [
                EmbeddingVector(
                    vector=[0.0] * 1536,  # Default size for many embedding models
                    model=config.model_id if config else "default",
                    normalized=False
                ) for _ in range(len(texts))
            ]
        

    async def generate_raw_embedding(
        self, 
        text: str, 
        provider_id: str,
        model_id: Optional[str] = None,
        normalize: bool = True
    ) -> EmbeddingVector:
        """
        Generate embedding with raw parameters, bypassing the config object.
        This method is useful for API endpoints to avoid Pydantic validation issues.
        
        Args:
            text: Text to embed
            provider_id: ID of the provider to use
            model_id: Optional model ID
            normalize: Whether to normalize the embedding
            
        Returns:
            EmbeddingVector object
        """
        try:
            # Get provider directly from factory
            provider = await self.provider_factory.get_provider(provider_id)
            
            # Generate embedding
            embedding = await provider.get_embedding(text, model=model_id)
            
            # Normalize if requested
            if normalize and not embedding.normalized:
                embedding = embedding.normalize()
                
            return embedding
        except Exception as e:
            self.logger.error(f"Error generating raw embedding: {str(e)}", exc_info=True)
            raise
    
    async def generate_page_embedding(self, tx: Transaction, page, config: EmbeddingRequestConfig = None) -> PageEmbeddings:
        """
        Generate embeddings for a page.
        
        Args:
            tx: Database transaction
            page: Page object or dictionary
            config: Optional embedding configuration
            
        Returns:
            PageEmbeddings object
        """
        # Use default config if not provided
        if config is None:
            config = EmbeddingRequestConfig()
        
        # Extract page properties
        try:
            page_id = str(page.id if hasattr(page, 'id') else page.get('id'))
            url = str(page.url if hasattr(page, 'url') else page.get('url'))
            title = page.title if hasattr(page, 'title') else page.get('title', '')
            content = page.content if hasattr(page, 'content') else page.get('content', '')
            
            self.logger.info(f"Generating embeddings for page: {page_id}, url: {url}")
            
            # Create embedding container
            page_embeddings = PageEmbeddings(
                page_id=page_id,
                url=url,
                model=config.model_id,
                status=EmbeddingStatus.PROCESSING
            )
        except Exception as e:
            self.logger.error(f"Error extracting page properties: {str(e)}", exc_info=True)
            # Return a failed embedding result
            return PageEmbeddings(
                page_id=str(page.id if hasattr(page, 'id') else page.get('id', 'unknown')),
                url=str(page.url if hasattr(page, 'url') else page.get('url', 'unknown')),
                model=config.model_id,
                status=EmbeddingStatus.FAILED,
                error=f"Error extracting page properties: {str(e)}"
            )
        
        try:
            # Get provider
            provider = await self.provider_factory.get_provider(config.provider_id)
            
            # 1. Embed metadata
            if config.include_metadata:
                self.logger.debug(f"Embedding metadata for page {page_id}")
                metadata_text = f"Title: {title}\nURL: {url}"
                if hasattr(page, 'metadata') or 'metadata' in page:
                    page_metadata = page.metadata if hasattr(page, 'metadata') else page.get('metadata', {})
                    for key, value in page_metadata.items():
                        if isinstance(value, (str, int, float, bool)):
                            metadata_text += f"\n{key}: {value}"
                
                metadata_embedding = await provider.get_embedding(metadata_text, model = getattr(config.model_id, 'value', None) if config.model_id else None)
                if config.normalize:
                    metadata_embedding = metadata_embedding.normalize()
                page_embeddings.metadata_embedding = metadata_embedding
            
            # 2. Embed content if requested
            if config.include_content and content:
                # Check if content is too large for direct embedding
                if len(content) > 8000:  # Typical token limit for many embedding models
                    self.logger.info(f"Content too large for direct embedding: {len(content)} chars")
                    # We'll use chunks instead
                else:
                    self.logger.debug(f"Embedding full content for page {page_id}")
                    content_embedding = await provider.get_embedding(content, model = getattr(config.model_id, 'value', None) if config.model_id else None)
                    if config.normalize:
                        content_embedding = content_embedding.normalize()
                    page_embeddings.content_embedding = content_embedding
            
            # 3. Process content chunks
            if content and (config.include_content or len(content) > 8000):
                self.logger.debug(f"Chunking content for page {page_id}")
                # Chunk the content
                chunks = await provider.chunk_text(
                    content, 
                    chunk_size=config.chunk_size, 
                    chunk_overlap=config.chunk_overlap
                )
                
                # Limit chunks if specified
                if config.max_chunks and len(chunks) > config.max_chunks:
                    self.logger.warning(f"Limiting chunks from {len(chunks)} to {config.max_chunks}")
                    chunks = chunks[:config.max_chunks]
                
                # Batch embed chunks if there are more than 1
                if len(chunks) > 1:
                    self.logger.debug(f"Batch embedding {len(chunks)} chunks for page {page_id}")
                    chunk_texts = [chunk.content for chunk in chunks]
                    chunk_embeddings = await provider.batch_embed(chunk_texts, model = getattr(config.model_id, 'value', None) if config.model_id else None)
                    
                    # Add embeddings to chunks
                    for i, chunk in enumerate(chunks):
                        if config.normalize:
                            chunk.embedding = chunk_embeddings[i].normalize()
                        else:
                            chunk.embedding = chunk_embeddings[i]
                
                # Single chunk case
                elif len(chunks) == 1:
                    self.logger.debug(f"Embedding single chunk for page {page_id}")
                    chunk_embedding = await provider.get_embedding(chunks[0].content, model = getattr(config.model_id, 'value', None) if config.model_id else None)
                    if config.normalize:
                        chunk_embedding = chunk_embedding.normalize()
                    chunks[0].embedding = chunk_embedding
                

                # Store chunks
                page_embeddings.chunk_embeddings = chunks
            
            # Update status to completed
            page_embeddings.status = EmbeddingStatus.COMPLETED
            page_embeddings.last_updated = datetime.now()
            
            # Store embeddings in Neo4j if graph service is available
            if self.graph_service:
                await self._store_page_embeddings(tx, page_embeddings)
            
            self.logger.info(f"Successfully generated embeddings for page {page_id}")
            return page_embeddings
            
        except Exception as e:
            self.logger.error(f"Error generating page embeddings: {str(e)}", exc_info=True)
            page_embeddings.status = EmbeddingStatus.FAILED
            page_embeddings.error = str(e)
            page_embeddings.last_updated = datetime.now()
            return page_embeddings
    
    async def _store_page_embeddings(self, tx: Transaction, embeddings: PageEmbeddings) -> None:
        """
        Store page embeddings in Neo4j using the graph service.
        
        Args:
            tx: Database transaction
            embeddings: PageEmbeddings object
        """
        try:
            if not self.graph_service:
                self.logger.warning("Cannot store embeddings: graph service not available")
                return
                    
            self.logger.debug(f"Storing embeddings for page {embeddings.page_id}")
            
            # Store the metadata embedding
            if embeddings.metadata_embedding:
                await self.graph_service.store_embedding(
                    tx,
                    embeddings.page_id,
                    embeddings.metadata_embedding.vector,
                    embedding_type=EmbeddingType.METADATA.value,
                    model=str(embeddings.model)  # Ensure model is a string
                )
            
            # Store the content embedding if available
            if embeddings.content_embedding:
                await self.graph_service.store_embedding(
                    tx,
                    embeddings.page_id,
                    embeddings.content_embedding.vector,
                    embedding_type=EmbeddingType.FULL_CONTENT.value,
                    model=embeddings.model
                )
            
            # Store the summary embedding if available
            if embeddings.summary_embedding:
                await self.graph_service.store_embedding(
                    tx,
                    embeddings.page_id,
                    embeddings.summary_embedding.vector,
                    embedding_type=EmbeddingType.SUMMARY.value,
                    model=embeddings.model
                )
            
            # Store chunk embeddings
            for i, chunk in enumerate(embeddings.chunk_embeddings):
                if chunk.embedding:
                    await self.graph_service.store_chunk_embedding(
                        tx,
                        embeddings.page_id,
                        chunk.embedding.vector,
                        chunk_index=i,
                        total_chunks=len(embeddings.chunk_embeddings),
                        start_char=chunk.start_char,
                        end_char=chunk.end_char,
                        model=embeddings.model
                    )
            
            # Update page embedding status
            await self.graph_service.update_page_embedding_status(
                tx,
                embeddings.page_id,
                status=embeddings.status.value,
                last_updated=embeddings.last_updated,
                model=embeddings.model,
                error=embeddings.error
            )
            
            self.logger.info(f"Successfully stored embeddings for page {embeddings.page_id}")
        except Exception as e:
            self.logger.error(f"Error storing embeddings: {str(e)}", exc_info=True)
            # Don't re-raise the exception to allow the calling function to continue
    
    async def find_similar_content(
        self, 
        tx: Transaction, 
        query_text: str,
        limit: int = 5,
        threshold: float = 0.7,
        config: EmbeddingRequestConfig = None
    ) -> List[Dict[str, Any]]:
        """
        Find content similar to query text using embeddings.
        
        Args:
            tx: Database transaction
            query_text: Query text to find similar content for
            limit: Maximum number of results to return
            threshold: Minimum similarity threshold
            config: Optional embedding configuration
            
        Returns:
            List of similar content items with similarity scores
        """
        try:
            if not self.graph_service:
                self.logger.warning("Cannot find similar content: graph service not available")
                return []
                
            # Use default config if not provided
            if config is None:
                config = EmbeddingRequestConfig()
            
            self.logger.info(f"Finding content similar to query (length: {len(query_text)})")
            
            # Generate embedding for query
            query_embedding = await self.get_embedding(query_text, config)
            
            # Find similar content in Neo4j
            similar_content = await self.graph_service.find_similar_by_embedding(
                tx,
                query_embedding.vector,
                embedding_type=EmbeddingType.METADATA.value,  # Default to metadata
                limit=limit,
                threshold=threshold,
                model=query_embedding.model
            )
            
            self.logger.info(f"Found {len(similar_content)} similar content items")
            return similar_content
            
        except Exception as e:
            self.logger.error(f"Error finding similar content: {str(e)}", exc_info=True)
            return []
    
    async def chunk_text(self, text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[ContentChunk]:
        """
        Split text into chunks with overlap.
        
        Args:
            text: Text to split into chunks
            chunk_size: Maximum size of each chunk
            chunk_overlap: Overlap between chunks
            
        Returns:
            List of ContentChunk objects
        """
        try:
            self.logger.debug(f"Chunking text of length {len(text)} with chunk_size={chunk_size}, overlap={chunk_overlap}")
            
            if not text:
                self.logger.warning("Empty text provided for chunking")
                return []
                
            # Get provider (use default)
            provider = await self.provider_factory.get_provider()
            
            # Use provider's chunking method
            chunks = await provider.chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            
            self.logger.debug(f"Created {len(chunks)} chunks from text")
            return chunks
            
        except Exception as e:
            self.logger.error(f"Error chunking text: {str(e)}", exc_info=True)
            # Return a single chunk with the original text as a fallback
            if text:
                return [ContentChunk(
                    content=text[:min(len(text), chunk_size)],
                    start_char=0,
                    end_char=min(len(text), chunk_size)
                )]
            return []
    
    async def create_semantic_relationships(
        self,
        tx: Transaction,
        source_id: str,
        threshold: float = 0.7,
        limit: int = 10,
        embedding_type: str = "metadata"
    ) -> List[Dict[str, Any]]:
        """
        Create relationships between semantically similar pages.
        
        Args:
            tx: Database transaction
            source_id: Source page ID
            threshold: Minimum similarity threshold
            limit: Maximum number of relationships to create
            embedding_type: Type of embedding to use
            
        Returns:
            List of created relationships
        """
        try:
            if not self.graph_service:
                self.logger.warning("Cannot create semantic relationships: graph service not available")
                return []
                
            # Delegate to graph service instead of trying to execute directly
            relationships = await self.graph_service.create_semantic_relationships(
                tx,
                source_id,
                threshold=threshold,
                limit=limit,
                embedding_type=embedding_type
            )
            
            return relationships
            
        except Exception as e:
            self.logger.error(f"Error creating semantic relationships: {str(e)}", exc_info=True)
            return []
            
    async def initialize_schema(self, tx: Transaction) -> bool:
        """
        Initialize necessary Neo4j schema for embeddings support.
        
        Args:
            tx: Active database transaction
            
        Returns:
            bool: True if initialization was successful
        """
        try:
            self.logger.info("Initializing embedding schema in Neo4j")
            
            # Ensure graph service is available
            if not self.graph_service:
                self.logger.error("Cannot initialize embedding schema: graph service not available")
                return False
            
            # Schema creation queries
            schema_queries = [
                # Page ID constraint (if not already exists)
                """
                CREATE CONSTRAINT embedding_page_id_unique IF NOT EXISTS
                FOR (p:Page) REQUIRE p.id IS NOT NULL
                """,
                
                # Embedding indexes
                """
                CREATE INDEX page_metadata_embedding IF NOT EXISTS
                FOR (p:Page) ON p.metadata_embedding
                """,
                
                """
                CREATE INDEX page_content_embedding IF NOT EXISTS
                FOR (p:Page) ON p.content_embedding
                """,
                
                """
                CREATE INDEX page_summary_embedding IF NOT EXISTS
                FOR (p:Page) ON p.summary_embedding
                """,
                
                # Chunk indexes
                """
                CREATE INDEX chunk_embedding_index IF NOT EXISTS
                FOR (c:Chunk) ON c.embedding
                """
            ]

            # Run each schema query
            for query in schema_queries:
                try:
                    await self.graph_service.graph_operations.connection.execute_query(query, {}, transaction=tx)
                    self.logger.debug(f"Successfully executed schema query: {query[:50]}...")
                except Exception as e:
                    self.logger.warning(f"Schema query failed: {query[:50]}... Error: {str(e)}")
                    # Continue with other queries even if one fails
            
            # Try to create SEMANTIC_SIMILAR relationship type
            try:
                semantic_rel_query = """
                MATCH (n:Page) WHERE n.id IS NOT NULL
                WITH n LIMIT 1
                MATCH (m:Page) WHERE m.id IS NOT NULL AND m <> n
                WITH n, m LIMIT 1
                MERGE (n)-[r:SEMANTIC_SIMILAR {strength: 0.0}]->(m)
                DELETE r
                """
                await self.graph_service.graph_operations.connection.execute_query(semantic_rel_query, {}, transaction=tx)
            except Exception as e:
                self.logger.warning(f"Could not initialize SEMANTIC_SIMILAR relationship: {str(e)}")
            
            self.logger.info("Successfully initialized embedding schema")
            return True
        except Exception as e:
            self.logger.error(f"Error initializing embedding schema: {str(e)}", exc_info=True)
            return False
        

    # Vector Embedding Operations
    async def initialize_vector_indexes(self) -> Dict[str, Any]:
        """Initialize vector indexes for all supported embedding providers."""
        try:
            # Ensure graph service is available
            if not self.graph_service:
                self.logger.error("Cannot initialize vector indexes: graph service not available")
                return {
                    "success": False,
                    "error": "Graph service not available"
                }
                
            self.logger.info("Initializing vector indexes for embedding providers")
            
            # Step 1: Get registered embedding providers from factory
            providers_info = await self._get_embedding_providers_info()
            
            # Create transaction for all operations
            async with self.graph_service.graph_operations.transaction() as tx:
                # Step 2: Drop existing problematic indexes
                await self._drop_existing_embedding_indexes(tx)
                
                # Step 3: Create vector indexes for each provider
                results = {}
                for provider_id, info in providers_info.items():
                    provider_result = await self._create_vector_indexes_for_provider(
                        tx, provider_id, info
                    )
                    results[provider_id] = provider_result
                
                # Step 4: Verify vector indexes were created successfully
                verification_result = await self._verify_vector_indexes(tx)
                if not verification_result.get("success", False):
                    self.logger.warning("Vector index verification failed - indexes may not be available")
                    results["verification"] = verification_result
                else:
                    self.logger.info(f"Vector index verification successful - found {len(verification_result.get('vector_indexes', []))} indexes")
                    results["verification"] = verification_result
                    
            return {
                "success": True,
                "providers_configured": len(results) - 1,  # Subtract 1 for verification entry
                "provider_results": results
            }
            
        except Exception as e:
            self.logger.error(f"Error initializing vector indexes: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }


    async def _get_embedding_providers_info(self) -> Dict[str, Dict[str, Any]]:
        """Get information about available embedding providers from factory."""
        try:
            provider_info = {}
            
            # Get all registered providers from the factory
            registered_providers = await self.provider_factory.list_providers()
            
            for provider_id in registered_providers:
                try:
                    # Get each provider instance to query dimensions and model info
                    provider = await self.provider_factory.get_provider(provider_id)
                    
                    # Get default dimensions based on provider type
                    dimensions = 1536  # Default for most models
                    if provider_id == "ollama":
                        dimensions = 4096  # Default for many Ollama models
                        
                    # Try to get dimensions from provider if available
                    if hasattr(provider, "get_dimensions"):
                        provider_dimensions = await provider.get_dimensions()
                        if provider_dimensions:
                            dimensions = provider_dimensions
                    
                    # Get provider-specific config
                    config = await self.provider_factory._get_provider_config(provider_id)
                    model = config.get("model", self.provider_factory._get_default_model_for_provider(provider_id))
                    
                    provider_info[provider_id] = {
                        "dimensions": dimensions,
                        "model": model,
                        "similarity_function": "cosine",  # Default
                        "provider_id": provider_id
                    }
                    
                    self.logger.info(f"Added provider {provider_id} with dimensions {dimensions}, model {model}")
                    
                except Exception as e:
                    self.logger.warning(f"Error getting info for provider {provider_id}: {str(e)}")
                    # Add minimal info for the provider to avoid complete failure
                    provider_info[provider_id] = {
                        "dimensions": 1536,  # Safe default
                        "model": self.provider_factory._get_default_model_for_provider(provider_id),
                        "similarity_function": "cosine",
                        "provider_id": provider_id
                    }
            
            # Handle case where no providers were found
            if not provider_info:
                self.logger.warning("No embedding providers found, using default configurations")
                provider_info = {
                    "openai": {
                        "dimensions": 1536,
                        "model": "text-embedding-ada-002",
                        "similarity_function": "cosine",
                        "provider_id": "openai"
                    }
                }
                
                # Add ollama if available
                if "ollama" in registered_providers:
                    provider_info["ollama"] = {
                        "dimensions": 4096,
                        "model": "mxbai-embed-large",
                        "similarity_function": "cosine",
                        "provider_id": "ollama"
                    }
            
            return provider_info
            
        except Exception as e:
            self.logger.error(f"Error getting embedding provider info: {str(e)}", exc_info=True)
            # Return minimal default configuration to prevent complete failure
            return {
                "openai": {
                    "dimensions": 1536,
                    "model": "text-embedding-ada-002",
                    "similarity_function": "cosine",
                    "provider_id": "openai"
                }
            }

    async def _drop_existing_embedding_indexes(self, tx: Transaction) -> None:
        """Drop existing non-vector embedding indexes that might cause issues."""
        try:
            # First, let's check for constraints that might be related to indexes
            constraints_query = "SHOW CONSTRAINTS"
            constraints_result = await self.graph_service.graph_operations.connection.execute_query(
                constraints_query,
                parameters={},
                transaction=tx
            )
            
            # We don't want to drop the page_id constraint, as it's needed for data integrity
            # But we need to log it so we're aware
            embedding_constraints = []
            for constraint in constraints_result:
                constraint_name = constraint.get("name", "").lower()
                if "embedding" in constraint_name:
                    embedding_constraints.append(constraint.get("name"))
                    self.logger.info(f"Found embedding-related constraint: {constraint.get('name')}")
            
            # Get all indexes
            indexes_query = "SHOW INDEXES"
            indexes_result = await self.graph_service.graph_operations.connection.execute_query(
                indexes_query,
                parameters={},
                transaction=tx
            )
            
            # Find embedding-related indexes that are not VECTOR type
            for index in indexes_result:
                index_name = index.get("name", "").lower()
                index_type = index.get("type", "")
                owner_constraint = index.get("owningConstraint", None)
                
                # Skip indexes owned by constraints
                if owner_constraint:
                    self.logger.info(f"Skipping index {index.get('name')} owned by constraint {owner_constraint}")
                    continue
                    
                # Check if it's a problematic index for embeddings (not a VECTOR index)
                if ("embedding" in index_name) and index_type != "VECTOR":
                    drop_query = f"DROP INDEX `{index.get('name')}`"
                    
                    self.logger.info(f"Dropping problematic non-VECTOR index for embeddings: {index.get('name')}")
                    
                    try:
                        await self.graph_service.graph_operations.connection.execute_query(
                            drop_query,
                            parameters={},
                            transaction=tx
                        )
                        
                        self.logger.info(f"Successfully dropped index: {index.get('name')}")
                    except Exception as drop_error:
                        self.logger.warning(f"Error dropping index {index.get('name')}: {str(drop_error)}")
                        
        except Exception as e:
            self.logger.warning(f"Error checking/dropping existing indexes: {str(e)}")

    # Add a verification step after index creation
    async def _verify_vector_indexes(self, tx: Transaction) -> Dict[str, Any]:
        """Verify that vector indexes were correctly created."""
        try:
            indexes_query = "SHOW INDEXES WHERE type = 'VECTOR'"
            result = await self.graph_service.graph_operations.connection.execute_query(
                indexes_query,
                parameters={},
                transaction=tx
            )
            
            vector_indexes = [index.get("name") for index in result]
            self.logger.info(f"Found {len(vector_indexes)} vector indexes: {vector_indexes}")
            
            return {
                "success": len(vector_indexes) > 0,
                "vector_indexes": vector_indexes
            }
        except Exception as e:
            self.logger.error(f"Error verifying vector indexes: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def _create_vector_indexes_for_provider(
        self,
        tx: Transaction,
        provider_id: str,
        provider_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create vector indexes for a specific provider."""
        try:
            dimensions = provider_info.get("dimensions", 1536)
            similarity_function = provider_info.get("similarity_function", "cosine")
            created_indexes = []
            
            # Check constraints first to avoid conflicts
            constraints_query = "SHOW CONSTRAINTS"
            constraints_result = await self.graph_service.graph_operations.connection.execute_query(
                constraints_query,
                parameters={},
                transaction=tx
            )
            
            # Extract properties with constraints
            constrained_properties = []
            for constraint in constraints_result:
                # Get properties from the constraint
                if "propertyNames" in constraint:
                    constrained_properties.extend(constraint.get("propertyNames", []))
            
            self.logger.debug(f"Properties with constraints: {constrained_properties}")
            
            # Base property names for different embedding types
            property_bases = {
                "metadata": "metadata_embedding",
                "content": "content_embedding", 
                "summary": "summary_embedding",
                "chunk": "embedding"  # For Chunk nodes
            }
            
            # Generate provider-specific property names
            for emb_type, base_name in property_bases.items():
                # Skip chunk for now - it needs special handling
                if emb_type == "chunk":
                    continue
                    
                # Skip properties with constraints
                if base_name in constrained_properties:
                    self.logger.info(f"Skipping property {base_name} as it has a constraint")
                    continue
                    
                # Create vector index for this property
                index_name = f"{provider_id}_{emb_type}_vector_idx"
                property_name = base_name
                
                try:
                    vector_index_query = f"""
                    CREATE VECTOR INDEX `{index_name}` IF NOT EXISTS
                    FOR (p:Page)
                    ON p.{property_name}
                    OPTIONS {{indexConfig: {{
                    `vector.dimensions`: {dimensions},
                    `vector.similarity_function`: '{similarity_function}'
                    }}}}
                    """
                    
                    await self.graph_service.graph_operations.connection.execute_query(
                        vector_index_query,
                        parameters={},
                        transaction=tx
                    )
                    
                    created_indexes.append({
                        "name": index_name,
                        "node_label": "Page",
                        "property": property_name,
                        "dimensions": dimensions 
                    })
                    
                    self.logger.info(f"Created vector index: {index_name}")
                except Exception as e:
                    self.logger.warning(f"Error creating vector index {index_name}: {str(e)}")
            
            # Handle chunk embedding index separately
            try:
                chunk_index_name = f"{provider_id}_chunk_vector_idx"
                # Use backticks around index name
                await self.graph_service.graph_operations.connection.execute_query(
                    f"""
                    CREATE VECTOR INDEX `{chunk_index_name}` IF NOT EXISTS
                    FOR (c:Chunk)
                    ON c.embedding
                    OPTIONS {{indexConfig: {{
                    `vector.dimensions`: {dimensions},
                    `vector.similarity_function`: '{similarity_function}'
                    }}}}
                    """,
                    parameters={},
                    transaction=tx
                )
                
                created_indexes.append({
                    "name": chunk_index_name,
                    "node_label": "Chunk",
                    "property": "embedding",
                    "dimensions": dimensions
                })
                
                self.logger.info(f"Created chunk vector index: {chunk_index_name}")
            except Exception as e:
                self.logger.warning(f"Error creating chunk vector index: {str(e)}")
            
            return {
                "success": True,
                "provider_id": provider_id,
                "indexes_created": len(created_indexes),
                "indexes": created_indexes,
                "dimensions": dimensions,
                "similarity_function": similarity_function
            }
        except Exception as e:
            self.logger.error(f"Error creating vector indexes for provider {provider_id}: {str(e)}")
            return {
                "success": False,
                "provider_id": provider_id,
                "error": str(e)
            }
        
