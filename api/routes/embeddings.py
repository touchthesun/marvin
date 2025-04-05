# api/routes/embeddings.py
from fastapi import APIRouter, Depends, Path, Body

from core.utils.logger import get_logger
from api.state import get_app_state
from api.dependencies import get_graph_service
from api.models.common import APIResponse
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
    if not app_state.embedding_service:
        return {
            "success": False,
            "error": {
                "message": "Embedding service not available"
            }
        }
        
    try:
        # Use the session context manager with a transaction
        async with app_state.db_connection.session() as db_session:
            # Create and initialize transaction
            tx = Transaction()
            try:
                # Initialize transaction with db session
                await tx.initialize_db_transaction(db_session)
                
                # Get the page
                page = await graph_service.get_page_by_id(tx, page_id)
                
                if not page:
                    await tx.rollback()
                    return {
                        "success": False,
                        "error": {
                            "message": f"Page not found: {page_id}"
                        }
                    }
                    
                # Get the embedding provider
                provider = await app_state.embedding_service.provider_factory.get_provider(request.provider_id)
                
                results = {
                    "metadata_embedding": None,
                    "content_embedding": None,
                    "chunks": []
                }
                
                # Generate metadata embedding if requested
                if request.include_metadata:
                    # Build metadata text from relevant fields
                    metadata_text = f"{page.title or ''} {page.domain or ''}"
                    if hasattr(page, "keywords") and page.keywords:
                        metadata_text += " " + " ".join(page.keywords.keys())
                        
                    # Get embedding
                    metadata_embedding = await provider.get_embedding(
                        text=metadata_text,
                        model=request.model_id
                    )
                    
                    # Store embedding
                    await graph_service.store_embedding(
                        tx,
                        page_id,
                        metadata_embedding.vector,
                        embedding_type="metadata",
                        model=metadata_embedding.model
                    )
                    
                    results["metadata_embedding"] = {
                        "dimension": metadata_embedding.dimension,
                        "model": metadata_embedding.model
                    }
                
                # Generate content embedding if requested
                if request.include_content and hasattr(page, "content") and page.content:
                    # If chunking is requested, handle differently
                    if request.chunk_size and request.chunk_size > 0:
                        # Use embedding service's chunking method if available
                        if hasattr(app_state.embedding_service, "chunk_text"):
                            chunks = await app_state.embedding_service.chunk_text(
                                page.content, 
                                chunk_size=request.chunk_size, 
                                chunk_overlap=request.chunk_overlap or 200
                            )
                            
                            # Convert to the format expected by the rest of the code
                            chunk_dicts = [
                                {
                                    "text": chunk.content,
                                    "start_char": chunk.start_char,
                                    "end_char": chunk.end_char
                                }
                                for chunk in chunks
                            ]
                        else:
                            # Simple chunking by character count as fallback
                            content = page.content
                            chunk_size = request.chunk_size
                            chunk_overlap = request.chunk_overlap or 0
                            chunk_dicts = []
                            
                            for i in range(0, len(content), max(1, chunk_size - chunk_overlap)):
                                chunk_end = min(i + chunk_size, len(content))
                                chunk_dicts.append({
                                    "text": content[i:chunk_end],
                                    "start_char": i,
                                    "end_char": chunk_end
                                })
                        
                        # Generate embeddings for each chunk
                        for i, chunk in enumerate(chunk_dicts):
                            # Get embedding for chunk
                            chunk_embedding = await provider.get_embedding(
                                text=chunk["text"],
                                model=request.model_id
                            )
                            
                            # Store chunk embedding
                            await graph_service.store_chunk_embedding(
                                tx,
                                page_id,
                                chunk_embedding.vector,
                                chunk_index=i,
                                total_chunks=len(chunk_dicts),
                                start_char=chunk["start_char"],
                                end_char=chunk["end_char"],
                                model=chunk_embedding.model
                            )
                            
                            # Add to results
                            results["chunks"].append({
                                "index": i,
                                "start_char": chunk["start_char"],
                                "end_char": chunk["end_char"],
                                "dimension": chunk_embedding.dimension,
                                "model": chunk_embedding.model
                            })
                    else:
                        # Generate single embedding for full content
                        content_embedding = await provider.get_embedding(
                            text=page.content,
                            model=request.model_id
                        )
                        
                        # Store embedding
                        await graph_service.store_embedding(
                            tx,
                            page_id,
                            content_embedding.vector,
                            embedding_type="full_content",
                            model=content_embedding.model
                        )
                        
                        results["content_embedding"] = {
                            "dimension": content_embedding.dimension,
                            "model": content_embedding.model
                        }
                
                # Commit transaction
                await tx.commit()
                
                # Update page embedding status (in a new transaction)
                # Use the transaction context manager this time
                async with app_state.db_connection.transaction() as status_tx:
                    await graph_service.update_page_embedding_status(
                        status_tx,
                        page_id,
                        status="completed",
                        last_updated=None,  # Current time will be used
                        model=request.model_id
                    )
                
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
                await tx.rollback()
                raise
    except Exception as e:
        logger.error(f"Error generating page embeddings: {str(e)}", exc_info=True)
        
        # Try to update error status
        try:
            # Use transaction context manager for error status update
            async with app_state.db_connection.transaction() as status_tx:
                await graph_service.update_page_embedding_status(
                    status_tx,
                    page_id,
                    status="failed",
                    last_updated=None,
                    error=str(e)
                )
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