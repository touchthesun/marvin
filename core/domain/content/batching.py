from dataclasses import dataclass
from typing import List, Dict, Optional, Any
import asyncio
import time
from datetime import datetime
from core.utils.logger import get_logger
from core.infrastructure.database.transactions import Transaction
from .types import ProcessingStatus, ProcessingError, DocumentMetadata, BatchMetadata
from .models.context import ProcessingContext
from .processor import ContentProcessor


@dataclass
class BatchProcessorConfig:
    """Configuration for batch processing.
    
    Attributes:
        max_concurrent: Maximum concurrent document processes
        batch_size: Number of documents per processing chunk
        max_retries: Maximum retry attempts per document
        timeout: Processing timeout in seconds
    """
    max_concurrent: int = 10
    batch_size: int = 10
    max_retries: int = 3
    timeout: int = 300


class BatchProcessor:
    """Manages asynchronous batch processing of documents.
    
    Handles:
    - Concurrent document processing
    - Progress tracking
    - Error handling and retry logic
    - State management
    """
    
    def __init__(self,
                content_processor: 'ContentProcessor',
                processing_context: ProcessingContext,
                config: Optional[BatchProcessorConfig] = None):
        """Initialize with required dependencies.
        
        Args:
            content_processor: For processing document content
            processing_context: For managing processing state
            config: Optional processing configuration
        """
        self.content_processor = content_processor
        self.processing_context = processing_context
        self.config = config or BatchProcessorConfig()
        self.logger = get_logger(__name__)
        
        # Internal state
        self.document_queue: asyncio.Queue = asyncio.Queue()
        self.active_tasks: List[asyncio.Task] = []

    async def process_batch(self,
                          documents: List[Dict[str, Any]],
                          batch_id: Optional[str] = None) -> str:
        """Process a batch of documents.
        
        Args:
            documents: List of documents to process
            batch_id: Optional identifier for the batch
            
        Returns:
            Batch identifier
            
        Raises:
            ProcessingError: If batch processing fails
        """
        try:
            # Generate batch ID if none provided
            batch_id = batch_id or f"batch_{int(time.time())}_{id(documents)}"
            
            # Initialize batch tracking
            batch_meta = BatchMetadata(
                batch_id=batch_id,
                total_docs=len(documents),
                completed_docs=0,
                failed_docs=0,
                start_time=datetime.now(),
                status=ProcessingStatus.PENDING
            )
            
            # Start batch processing
            self.processing_context.start_batch(batch_id)
            
            try:
                # Queue documents for processing
                for doc in documents:
                    doc_meta = self._create_document_metadata(doc, batch_id)
                    await self.document_queue.put((doc, doc_meta))
                
                # Process the batch
                await self._process_batch_documents(batch_id)
                
                return batch_id
                
            except Exception as e:
                self.logger.error(f"Batch processing failed: {e}", exc_info=True)
                self.processing_context.end_batch(batch_id, error=str(e))
                raise
                
        except Exception as e:
            self.logger.error(f"Failed to initialize batch: {e}", exc_info=True)
            raise ProcessingError(f"Batch initialization failed: {str(e)}")

    def _create_document_metadata(self,
                                doc: Dict[str, Any],
                                batch_id: str) -> DocumentMetadata:
        """Create metadata for a document.
        
        Args:
            doc: Document to create metadata for
            batch_id: ID of containing batch
            
        Returns:
            Document metadata
        """
        return DocumentMetadata(
            doc_id=doc.get('id', str(id(doc))),
            source=doc.get('source', 'unknown'),
            size_bytes=len(str(doc.get('content', ''))),
            content_type=doc.get('content_type', 'text/plain'),
            timestamp=datetime.now(),
            status=ProcessingStatus.PENDING,
            batch_id=batch_id
        )

    async def _process_batch_documents(self, batch_id: str) -> None:
        """Process all documents in a batch.
        
        Args:
            batch_id: Batch to process
        """
        # Process documents in chunks
        while not self.document_queue.empty():
            # Get next chunk of documents
            chunk = []
            for _ in range(self.config.batch_size):
                if self.document_queue.empty():
                    break
                chunk.append(await self.document_queue.get())
            
            # Process chunk concurrently
            tasks = []
            for doc, doc_meta in chunk:
                task = asyncio.create_task(
                    self._process_document(doc, doc_meta, batch_id)
                )
                tasks.append(task)
                self.active_tasks.append(task)
            
            # Wait for chunk to complete
            await asyncio.gather(*tasks, return_exceptions=True)
        
        # End batch processing
        self.processing_context.end_batch(batch_id)

    async def _process_document(
        self,
        doc: Dict[str, Any],
        doc_meta: DocumentMetadata,
        batch_id: str,
        tx: Optional[Transaction] = None
    ) -> Dict[str, Any]:
        """Process a single document with optional transaction support."""
        for retry in range(self.config.max_retries):
            try:
                content = doc.get('content', '')
                if not content:
                    raise ValueError("Empty document content")
                
                # Process content with transaction context
                result = await self.content_processor.process_content(
                    content,
                    tx=tx  # Pass through transaction context
                )
                
                # Add rollback handler if using transaction
                if tx:
                    tx.add_rollback_handler(
                        lambda: self._cleanup_processed_content(doc_meta.doc_id)
                    )
                
                return {
                    'doc_id': doc_meta.doc_id,
                    'keywords': [kw.to_dict() for kw in result['keywords']],
                    'relationships': result['relationships'],
                    'status': ProcessingStatus.COMPLETED,
                    'batch_id': batch_id,
                    'error': None
                }
                
            except Exception as e:
                self.logger.warning(
                    f"Processing attempt {retry + 1} failed for document {doc_meta.doc_id}: {e}"
                )
                if retry < self.config.max_retries - 1:
                    await asyncio.sleep(1)
                else:
                    # Return error result on final retry
                    return {
                        'doc_id': doc_meta.doc_id,
                        'keywords': [],
                        'relationships': [],
                        'status': ProcessingStatus.FAILED,
                        'batch_id': batch_id,
                        'error': str(e)
                    }

    async def get_batch_status(self, batch_id: str) -> BatchMetadata:
        """Get current status of a batch.
        
        Args:
            batch_id: Batch to get status for
            
        Returns:
            Current batch status
            
        Raises:
            ValueError: If batch_id unknown
        """
        return self.processing_context.get_batch_metrics(batch_id)

    async def get_batch_results(self,
                              batch_id: str,
                              include_failed: bool = False
                              ) -> Dict[str, Any]:
        """Get results from a batch.
        
        Args:
            batch_id: Batch to get results for
            include_failed: Whether to include failed documents
            
        Returns:
            Batch results including document results
            
        Raises:
            ValueError: If batch_id unknown
        """
        # Get batch metrics
        metrics = self.processing_context.get_batch_metrics(batch_id)
        
        # Get document results
        keywords = []
        relationships = []
        for keyword_id in self.processing_context.get_batch_keywords(batch_id):
            keyword = await self.content_processor.get_keyword(keyword_id)
            if keyword:
                keywords.append(keyword.to_dict())
                # Get relationships for this keyword
                kw_rels = await self.content_processor.get_keyword_relationships(
                    keyword_id
                )
                relationships.extend(rel.to_dict() for rel in kw_rels)
        
        return {
            'batch_id': batch_id,
            'status': metrics['status'],
            'keywords': keywords,
            'relationships': relationships,
            'metrics': metrics
        }

    async def wait_for_batch(self,
                           batch_id: str,
                           timeout: Optional[float] = None
                           ) -> None:
        """Wait for a batch to complete.
        
        Args:
            batch_id: Batch to wait for
            timeout: Optional timeout in seconds
            
        Raises:
            TimeoutError: If batch does not complete within timeout
            ValueError: If batch_id unknown
        """
        start_time = time.time()
        timeout = timeout or self.config.timeout
        
        while True:
            status = self.processing_context.get_batch_status(batch_id)
            if status in {ProcessingStatus.COMPLETED, ProcessingStatus.FAILED}:
                return
                
            if time.time() - start_time > timeout:
                raise TimeoutError(
                    f"Batch {batch_id} did not complete within {timeout} seconds"
                )
                
            await asyncio.sleep(0.1)  # Brief pause between checks