# api/routes/embeddings.py
from fastapi import APIRouter, Depends, Path, Body

from core.utils.logger import get_logger
from api.state import get_app_state
from api.dependencies import get_graph_service
from api.models.common import APIResponse
from core.domain.embeddings.models import ContentChunk
from api.models.embeddings.request import (
    GenerateEmbeddingRequest,
    PageEmbeddingRequest,
    SearchEmbeddingRequest
)
from core.domain.embeddings.models import EmbeddingRequestConfig
from core.infrastructure.database.transactions import Transaction

router = APIRouter(prefix="/embeddings", tags=["embeddings"])
logger = get_logger(__name__)


@router.post("/generate", response_model=APIResponse)
async def generate_embedding(
    request: GenerateEmbeddingRequest = Body(...),
    app_state = Depends(get_app_state)
):
    """
    Generate an embedding vector for a text string.
    """
    # Check if embedding service is initialized
    if not hasattr(app_state, 'embedding_service') or app_state.embedding_service is None:
        logger.warning("Embedding service not available")
        return {
            "success": False,
            "error": {
                "message": "Embedding service not available"
            }
        }
    
    try:
        # Extract plain parameters from the request
        text = request.text
        provider_id = request.provider_id
        model_id = request.model_id
        normalize = request.normalize
        
        logger.debug(f"Generating embedding: text_length={len(text)}, provider={provider_id}, model={model_id}")
        
        # Get provider directly from factory
        provider = await app_state.embedding_service.provider_factory.get_provider(provider_id)
        
        # Generate embedding
        embedding = await provider.get_embedding(text, model=model_id)
        
        # Normalize if requested
        if normalize and not embedding.normalized:
            embedding = embedding.normalize()
        
        # Return the embedding as a simple dictionary
        return {
            "success": True,
            "data": {
                "embedding": embedding.vector,
                "model": str(embedding.model),
                "dimension": embedding.dimension,
                "normalized": embedding.normalized,
                "created_at": embedding.created_at.isoformat() if hasattr(embedding.created_at, 'isoformat') else str(embedding.created_at)
            }
        }
    except Exception as e:
        logger.error(f"Failed to generate embedding: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": {
                "message": f"Failed to generate embedding: {str(e)}"
            }
        }
    
@router.post("/page/{page_id}", response_model=APIResponse)
async def generate_page_embeddings(
    page_id: str = Path(..., description="ID of the page"),
    request: PageEmbeddingRequest = Body(...),
    graph_service = Depends(get_graph_service),
    app_state = Depends(get_app_state)
):
    """Generate embeddings for a page."""
    logger.info(f"Received embedding request: {request.model_dump()}")
    logger.info(f"Starting embedding generation for page {page_id} with provider {request.provider_id}, model {request.model_id}")
    logger.info(f"RAW PAGE EMBEDDING REQUEST: page_id={page_id}, request={request.model_dump()}")

    if hasattr(request, 'chunk_size') and request.chunk_size:
        logger.info(f"CHUNK SIZE RECEIVED: {request.chunk_size}, type: {type(request.chunk_size)}")
    else:
        logger.warning("NO CHUNK SIZE IN REQUEST")

    if not app_state.embedding_service:
        logger.error("Embedding service not available")
        return {
            "success": False,
            "error": {
                "message": "Embedding service not available"
            }
        }
        
    try:
        # Use the session context manager with a transaction
        logger.debug(f"Creating database session for page {page_id}")
        async with app_state.db_connection.session() as db_session:
            # Create and initialize transaction
            tx = Transaction()
            try:
                # Initialize transaction with db session
                logger.debug(f"Initializing transaction for page {page_id}")
                await tx.initialize_db_transaction(db_session)
                
                # Get the page
                logger.debug(f"Fetching page data for {page_id}")
                page = await graph_service.get_page_by_id(tx, page_id)
                
                if not page:
                    logger.warning(f"Page not found: {page_id}")
                    await tx.rollback()
                    return {
                        "success": False,
                        "error": {
                            "message": f"Page not found: {page_id}"
                        }
                    }
                
                logger.info(f"Retrieved page {page_id}: title='{page.title}', content_length={len(page.content) if hasattr(page, 'content') and page.content is not None else 'N/A'}")
                    
                # Get the embedding provider
                logger.debug(f"Getting embedding provider {request.provider_id}")
                provider = await app_state.embedding_service.provider_factory.get_provider(request.provider_id)
                logger.info(f"Using embedding provider: {provider.__class__.__name__}")
                
                results = {
                    "metadata_embedding": None,
                    "content_embedding": None,
                    "chunks": []
                }
                
                # Generate metadata embedding if requested
                if request.include_metadata:
                    logger.info(f"Generating metadata embedding for page {page_id}")
                    # Build metadata text from relevant fields
                    metadata_text = f"{page.title or ''} {page.domain or ''}"
                    if hasattr(page, "keywords") and page.keywords:
                        metadata_text += " " + " ".join(page.keywords.keys())
                    
                    logger.debug(f"Metadata text for embedding: '{metadata_text[:100]}...' (length: {len(metadata_text)})")
                        
                    # Get embedding
                    metadata_embedding = await provider.get_embedding(
                        text=metadata_text,
                        model=request.model_id
                    )
                    
                    logger.debug(f"Generated metadata embedding: dimension={metadata_embedding.dimension}, normalized={metadata_embedding.normalized}")
                    
                    # Store embedding
                    logger.debug(f"Storing metadata embedding for page {page_id}")
                    store_result = await graph_service.store_embedding(
                        tx,
                        page_id,
                        metadata_embedding.vector,
                        embedding_type="metadata",
                        model=metadata_embedding.model
                    )
                    logger.info(f"Metadata embedding storage result: {store_result if store_result is not None else 'No result returned'}")
                    
                    results["metadata_embedding"] = {
                        "dimension": metadata_embedding.dimension,
                        "model": metadata_embedding.model
                    }
                
                # Generate content embedding if requested
                if request.include_content:
                    logger.info(f"Content requested for embedding, page has content attribute: {hasattr(page, 'content')}")
                    
                    # Check if content exists and is not None
                    has_content = hasattr(page, "content") and page.content is not None
                    
                    if has_content:
                        logger.info(f"Page content exists and is {len(page.content)} characters long")
                        content = page.content
                    else:
                        # Create fallback content from title and URL
                        logger.warning(f"Page does not have valid content, using fallback")
                        content = f"{page.title or ''} {page.url or ''}"
                        if hasattr(page, "domain") and page.domain:
                            content += f" {page.domain}"
                        logger.info(f"Created fallback content: {len(content)} characters")
                    
                    # If chunking is requested, handle differently
                    if request.chunk_size and request.chunk_size > 0:
                        logger.info(f"CHUNKING ACTIVATED: size={request.chunk_size}, overlap={request.chunk_overlap or 200}")
                        
                        # Use embedding service's chunking method if available
                        if hasattr(app_state.embedding_service, "chunk_text"):
                            logger.debug("Using embedding service's chunk_text method")
                            try:
                                # This returns ContentChunk objects with all required fields
                                chunks = await app_state.embedding_service.chunk_text(
                                    content, 
                                    chunk_size=request.chunk_size, 
                                    chunk_overlap=request.chunk_overlap or 200
                                )
                                
                                logger.info(f"Created {len(chunks)} chunks using embedding service chunker")
                                
                                # Generate embeddings for each chunk
                                logger.info(f"Beginning embedding generation for {len(chunks)} chunks")
                                successful_chunks = 0
                                failed_chunks = 0
                                
                                for i, chunk in enumerate(chunks):
                                    try:
                                        chunk_text_sample = chunk.content[:50] + "..." if len(chunk.content) > 50 else chunk.content
                                        logger.debug(f"Processing chunk {i+1}/{len(chunks)}: chars {chunk.start_char}-{chunk.end_char}, text: '{chunk_text_sample}'")
                                        
                                        # Get embedding for chunk
                                        chunk_embedding = await provider.get_embedding(
                                            text=chunk.content,
                                            model=request.model_id
                                        )
                                        
                                        # Log the embedding details
                                        logger.debug(f"Generated embedding for chunk {i+1}: dimension={chunk_embedding.dimension}, model={chunk_embedding.model}")
                                        
                                        # Store chunk embedding - use the fields directly from the ContentChunk object
                                        logger.debug(f"Storing chunk {i+1} embedding to database")
                                        store_result = await graph_service.store_chunk_embedding(
                                            tx,
                                            page_id,
                                            chunk_embedding.vector,
                                            chunk_index=chunk.chunk_index,  # Use the field from ContentChunk
                                            total_chunks=chunk.total_chunks,  # Use the field from ContentChunk
                                            start_char=chunk.start_char,
                                            end_char=chunk.end_char,
                                            model=chunk_embedding.model
                                        )
                                        
                                        logger.debug(f"Chunk {i+1} storage result: {store_result if store_result is not None else 'No result returned'}")
                                        successful_chunks += 1
                                        
                                        # Add to results
                                        results["chunks"].append({
                                            "index": chunk.chunk_index,
                                            "start_char": chunk.start_char,
                                            "end_char": chunk.end_char,
                                            "dimension": chunk_embedding.dimension,
                                            "model": chunk_embedding.model
                                        })
                                    except Exception as e:
                                        failed_chunks += 1
                                        logger.error(f"Error processing chunk {i+1}/{len(chunks)}: {str(e)}", exc_info=True)
                                        logger.error(f"Chunk text sample: '{chunk.content[:100]}...'")
                                
                                logger.info(f"Chunk embedding generation complete: {successful_chunks} successful, {failed_chunks} failed")
                                
                            except Exception as e:
                                logger.error(f"Error using embedding service chunker: {str(e)}", exc_info=True)
                                # Fall back to manual chunking
                                logger.warning("Falling back to manual chunking due to error")
                                
                                # Simple chunking by character count as fallback
                                logger.debug("Using fallback chunking method")
                                chunk_size = request.chunk_size
                                chunk_overlap = request.chunk_overlap or 0
                                
                                # Calculate total chunks for proper indexing
                                total_chunks = max(1, (len(content) - chunk_overlap) // max(1, chunk_size - chunk_overlap))
                                if (len(content) - chunk_overlap) % max(1, chunk_size - chunk_overlap) > 0:
                                    total_chunks += 1
                                    
                                logger.debug(f"Calculated {total_chunks} total chunks for content length {len(content)}")
                                
                                # Generate chunks and embeddings
                                successful_chunks = 0
                                failed_chunks = 0
                                
                                for i in range(0, len(content), max(1, chunk_size - chunk_overlap)):
                                    try:
                                        chunk_end = min(i + chunk_size, len(content))
                                        chunk_text = content[i:chunk_end]
                                        
                                        # Create a proper ContentChunk object
                                        chunk = ContentChunk(
                                            content=chunk_text,
                                            start_char=i,
                                            end_char=chunk_end,
                                            chunk_index=i // max(1, chunk_size - chunk_overlap),
                                            total_chunks=total_chunks
                                        )
                                        
                                        chunk_text_sample = chunk.content[:50] + "..." if len(chunk.content) > 50 else chunk.content
                                        logger.debug(f"Processing chunk {chunk.chunk_index+1}/{chunk.total_chunks}: chars {chunk.start_char}-{chunk.end_char}, text: '{chunk_text_sample}'")
                                        
                                        # Get embedding for chunk
                                        chunk_embedding = await provider.get_embedding(
                                            text=chunk.content,
                                            model=request.model_id
                                        )
                                        
                                        # Store chunk embedding
                                        logger.debug(f"Storing chunk {chunk.chunk_index+1} embedding to database")
                                        store_result = await graph_service.store_chunk_embedding(
                                            tx,
                                            page_id,
                                            chunk_embedding.vector,
                                            chunk_index=chunk.chunk_index,
                                            total_chunks=chunk.total_chunks,
                                            start_char=chunk.start_char,
                                            end_char=chunk.end_char,
                                            model=chunk_embedding.model
                                        )
                                        
                                        logger.debug(f"Chunk {chunk.chunk_index+1} storage result: {store_result if store_result is not None else 'No result returned'}")
                                        successful_chunks += 1
                                        
                                        # Add to results
                                        results["chunks"].append({
                                            "index": chunk.chunk_index,
                                            "start_char": chunk.start_char,
                                            "end_char": chunk.end_char,
                                            "dimension": chunk_embedding.dimension,
                                            "model": chunk_embedding.model
                                        })
                                    except Exception as e:
                                        failed_chunks += 1
                                        logger.error(f"Error processing chunk {i // max(1, chunk_size - chunk_overlap)+1}/{total_chunks}: {str(e)}", exc_info=True)
                                
                                logger.info(f"Chunk embedding generation complete: {successful_chunks} successful, {failed_chunks} failed")
                        else:
                            # Simple chunking by character count as fallback
                            logger.debug("Using fallback chunking method - embedding service has no chunk_text method")
                            chunk_size = request.chunk_size
                            chunk_overlap = request.chunk_overlap or 0
                            
                            # Calculate total chunks for proper indexing
                            total_chunks = max(1, (len(content) - chunk_overlap) // max(1, chunk_size - chunk_overlap))
                            if (len(content) - chunk_overlap) % max(1, chunk_size - chunk_overlap) > 0:
                                total_chunks += 1
                                
                            logger.debug(f"Calculated {total_chunks} total chunks for content length {len(content)}")
                            
                            # Generate chunks and embeddings
                            successful_chunks = 0
                            failed_chunks = 0
                            
                            for i in range(0, len(content), max(1, chunk_size - chunk_overlap)):
                                try:
                                    chunk_end = min(i + chunk_size, len(content))
                                    chunk_text = content[i:chunk_end]
                                    chunk_index = i // max(1, chunk_size - chunk_overlap)
                                    
                                    # Create a proper ContentChunk object
                                    chunk = ContentChunk(
                                        content=chunk_text,
                                        start_char=i,
                                        end_char=chunk_end,
                                        chunk_index=chunk_index,
                                        total_chunks=total_chunks
                                    )
                                    
                                    chunk_text_sample = chunk.content[:50] + "..." if len(chunk.content) > 50 else chunk.content
                                    logger.debug(f"Processing chunk {chunk.chunk_index+1}/{chunk.total_chunks}: chars {chunk.start_char}-{chunk.end_char}, text: '{chunk_text_sample}'")
                                    
                                    # Get embedding for chunk
                                    chunk_embedding = await provider.get_embedding(
                                        text=chunk.content,
                                        model=request.model_id
                                    )
                                    
                                    # Store chunk embedding
                                    logger.debug(f"Storing chunk {chunk.chunk_index+1} embedding to database")
                                    store_result = await graph_service.store_chunk_embedding(
                                        tx,
                                        page_id,
                                        chunk_embedding.vector,
                                        chunk_index=chunk.chunk_index,
                                        total_chunks=chunk.total_chunks,
                                        start_char=chunk.start_char,
                                        end_char=chunk.end_char,
                                        model=chunk_embedding.model
                                    )
                                    
                                    logger.debug(f"Chunk {chunk.chunk_index+1} storage result: {store_result if store_result is not None else 'No result returned'}")
                                    successful_chunks += 1
                                    
                                    # Add to results
                                    results["chunks"].append({
                                        "index": chunk.chunk_index,
                                        "start_char": chunk.start_char,
                                        "end_char": chunk.end_char,
                                        "dimension": chunk_embedding.dimension,
                                        "model": chunk_embedding.model
                                    })
                                except Exception as e:
                                    failed_chunks += 1
                                    logger.error(f"Error processing chunk {chunk_index+1}/{total_chunks}: {str(e)}", exc_info=True)
                            
                            logger.info(f"Chunk embedding generation complete: {successful_chunks} successful, {failed_chunks} failed")
                    else:
                        # Generate single embedding for full content
                        logger.info(f"Generating single embedding for full content (length: {len(content)})")
                        content_embedding = await provider.get_embedding(
                            text=content,
                            model=request.model_id
                        )
                        
                        logger.debug(f"Generated content embedding: dimension={content_embedding.dimension}")
                        
                        # Store embedding
                        logger.debug(f"Storing full content embedding for page {page_id}")
                        store_result = await graph_service.store_embedding(
                            tx,
                            page_id,
                            content_embedding.vector,
                            embedding_type="full_content",
                            model=content_embedding.model
                        )
                        logger.info(f"Full content embedding storage result: {store_result if store_result is not None else 'No result returned'}")
                        
                        results["content_embedding"] = {
                            "dimension": content_embedding.dimension,
                            "model": content_embedding.model
                        }
                
                # Commit transaction
                logger.info(f"Committing transaction for page {page_id}")
                await tx.commit()
                logger.info(f"Transaction committed successfully for page {page_id}")
                
                # Update page embedding status (in a new transaction)
                logger.debug(f"Updating embedding status for page {page_id}")
                async with app_state.db_connection.transaction() as status_tx:
                    status_result = await graph_service.update_page_embedding_status(
                        status_tx,
                        page_id,
                        status="completed",
                        last_updated=None,  # Current time will be used
                        model=request.model_id
                    )
                    logger.debug(f"Status update result: {status_result if status_result is not None else 'No result returned'}")
                
                logger.info(f"Successfully completed embedding generation for page {page_id}")
                return {
                    "success": True,
                    "data": {
                        "page_id": page_id,
                        "status": "completed",
                        "embeddings": results
                    }
                }
            except Exception as e:
                # Ensure transaction is rolled back
                logger.error(f"Error in transaction, rolling back: {str(e)}", exc_info=True)
                await tx.rollback()
                logger.debug("Transaction rolled back")
                raise
    except Exception as e:
        logger.error(f"Error generating page embeddings: {str(e)}", exc_info=True)
        
        # Try to update error status
        try:
            logger.debug(f"Updating page {page_id} embedding status to 'failed'")
            # Use transaction context manager for error status update
            async with app_state.db_connection.transaction() as status_tx:
                await graph_service.update_page_embedding_status(
                    status_tx,
                    page_id,
                    status="failed",
                    last_updated=None,
                    error=str(e)
                )
                logger.debug(f"Updated page {page_id} status to failed")
        except Exception as status_error:
            logger.error(f"Error updating embedding status: {str(status_error)}")
            
        return {
            "success": False,
            "error": {
                "message": f"Error generating page embeddings: {str(e)}"
            }
        }



@router.post("/search", response_model=APIResponse)
async def search_with_embeddings(
    request: SearchEmbeddingRequest = Body(...),
    graph_service = Depends(get_graph_service),
    app_state = Depends(get_app_state)
):
    """Search for content using vector similarity."""
    if not app_state.embedding_service:
        return {
            "success": False,
            "error": {
                "message": "Embedding service not available"
            }
        }
        
    try:
        # Use the transaction context manager
        async with app_state.db_connection.transaction() as tx:
            # Get embedding provider
            provider = await app_state.embedding_service.provider_factory.get_provider(request.provider_id)
            
            # Generate embedding for query text
            query_embedding = await provider.get_embedding(
                text=request.query,
                model=request.model_id
            )
            
            # Use graph service to search by embedding
            results = await graph_service.find_similar_by_embedding(
                tx,
                query_embedding.vector,
                embedding_type=request.embedding_type,
                limit=request.limit,
                threshold=request.threshold,
                model=query_embedding.model
            )
            
            return {
                "success": True,
                "data": {
                    "results": results,
                    "query": request.query,
                    "model": str(query_embedding.model),
                    "count": len(results)
                }
            }
    except Exception as e:
        logger.error(f"Error in embedding search: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": {
                "message": f"Error in embedding search: {str(e)}"
            }
        }

@router.post("/semantic-relationships/{page_id}", response_model=APIResponse)
async def create_semantic_relationships(
    page_id: str = Path(..., description="ID of the source page"),
    threshold: float = 0.7,
    limit: int = 10,
    embedding_type: str = "metadata",
    graph_service = Depends(get_graph_service),
    app_state = Depends(get_app_state)
):
    """Create semantic relationships between pages based on embedding similarity."""
    try:
        # Use the transaction context manager
        async with app_state.db_connection.transaction() as tx:
            # Use embedding service if available, otherwise use graph service directly
            if app_state.embedding_service and hasattr(app_state.embedding_service, "create_semantic_relationships"):
                relationships = await app_state.embedding_service.create_semantic_relationships(
                    tx,
                    page_id,
                    threshold=threshold,
                    limit=limit,
                    embedding_type=embedding_type
                )
            else:
                # Fallback to graph service
                relationships = await graph_service.create_semantic_relationships(
                    tx,
                    page_id,
                    threshold=threshold,
                    limit=limit,
                    embedding_type=embedding_type
                )
            
            return {
                "success": True,
                "data": {
                    "relationships": relationships,
                    "count": len(relationships),
                    "source_id": page_id,
                    "threshold": threshold
                }
            }
    except Exception as e:
        logger.error(f"Error creating semantic relationships: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": {
                "message": f"Error creating semantic relationships: {str(e)}"
            }
        }

@router.post("/initialize-vector-indexes", response_model=APIResponse)
async def initialize_vector_indexes(
    app_state = Depends(get_app_state)
):
    """Initialize vector indexes for all registered embedding providers."""
    try:
        # Get the embedding service from app state
        embedding_service = app_state.embedding_service
        if not embedding_service:
            return {
                "success": False,
                "error": {"message": "Embedding service not initialized"}
            }
        
        # Initialize vector indexes
        result = await embedding_service.initialize_vector_indexes()
        
        return {
            "success": result.get("success", False),
            "data": result
        }
    except Exception as e:
        logger.error(f"Error initializing vector indexes: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": {"message": f"Error initializing vector indexes: {str(e)}"}
        }