from typing import Dict, Set, Optional
from datetime import datetime
from dataclasses import dataclass, field
from core.utils.logger import get_logger
from core.common.errors import  ProcessingError
from core.domain.content.types import ProcessingStatus
from ..keyword_identifier import KeywordIdentifier
from .relationships import RelationshipManager


@dataclass
class BatchContext:
    """Context for a processing batch.
    
    Tracks keywords, relationships, and status for a batch of documents.
    
    Attributes:
        batch_id: Unique identifier for the batch
        start_time: When batch processing started
        keywords: Set of keyword IDs in this batch
        status: Current processing status
        end_time: When batch processing completed
        error: Optional error message
    """
    batch_id: str
    start_time: datetime = field(default_factory=datetime.now)
    keywords: Set[str] = field(default_factory=set)
    status: ProcessingStatus = ProcessingStatus.PENDING
    end_time: Optional[datetime] = None
    error: Optional[str] = None


class ProcessingContext:
    """Manages state for content processing.
    
    This class provides a unified interface for managing processing state,
    including batch tracking and result storage. Uses dependency injection.
    """
    
    def __init__(self, relationship_manager: RelationshipManager):
        """Initialize with required dependencies.
        
        Args:
            relationship_manager: For managing keyword relationships
        """
        self.relationship_manager = relationship_manager
        self.logger = get_logger(__name__)
        
        # State tracking
        self._batch_contexts: Dict[str, BatchContext] = {}
        self._current_batch_id: Optional[str] = None
        self._processing_stack: Set[str] = set()
    
    def start_batch(self, batch_id: str) -> None:
        """Start processing a new batch.
        
        Args:
            batch_id: Unique identifier for the batch
            
        Raises:
            ValueError: If batch_id already exists
        """
        if batch_id in self._batch_contexts:
            raise ValueError(f"Batch {batch_id} already exists")
            
        self._batch_contexts[batch_id] = BatchContext(
            batch_id=batch_id,
            status=ProcessingStatus.IN_PROGRESS
        )
        self._current_batch_id = batch_id
        self.logger.debug(f"Started batch: {batch_id}")
    
    def end_batch(self, batch_id: str, error: Optional[str] = None) -> None:
        """End processing for a batch.
        
        Args:
            batch_id: Batch to end
            error: Optional error message if batch failed
            
        Raises:
            ValueError: If batch_id unknown
        """
        if batch_id not in self._batch_contexts:
            raise ValueError(f"Unknown batch: {batch_id}")
            
        context = self._batch_contexts[batch_id]
        context.end_time = datetime.now()
        
        if error:
            context.status = ProcessingStatus.FAILED
            context.error = error
        else:
            context.status = ProcessingStatus.COMPLETED
        
        if self._current_batch_id == batch_id:
            self._current_batch_id = None
            
        self.logger.debug(
            f"Ended batch {batch_id}: {context.status.value}"
            + (f" ({error})" if error else "")
        )
    
    def register_keyword(self, keyword: KeywordIdentifier) -> None:
        """Register a keyword with the current batch.
        
        Args:
            keyword: Keyword to register
            
        Raises:
            ProcessingError: If no active batch
        """
        try:
            if not self._current_batch_id:
                raise ProcessingError("No active batch")
                
            # Register with current batch
            context = self._batch_contexts[self._current_batch_id]
            context.keywords.add(keyword.id)
            
            self.logger.debug(
                f"Registered keyword '{keyword.canonical_text}' "
                f"[{keyword.id}] with batch {self._current_batch_id}"
            )
            
        except Exception as e:
            self.logger.error(f"Failed to register keyword: {str(e)}")
            raise ProcessingError(f"Failed to register keyword: {str(e)}")
    
    def get_batch_keywords(self, batch_id: str) -> Set[str]:
        """Get all keyword IDs registered in a batch.
        
        Args:
            batch_id: Batch to get keywords for
            
        Returns:
            Set of keyword IDs
            
        Raises:
            ValueError: If batch_id unknown
        """
        if batch_id not in self._batch_contexts:
            raise ValueError(f"Unknown batch: {batch_id}")
            
        return self._batch_contexts[batch_id].keywords.copy()
    
    def get_batch_status(self, batch_id: str) -> ProcessingStatus:
        """Get current status of a batch.
        
        Args:
            batch_id: Batch to get status for
            
        Returns:
            Current ProcessingStatus
            
        Raises:
            ValueError: If batch_id unknown
        """
        if batch_id not in self._batch_contexts:
            raise ValueError(f"Unknown batch: {batch_id}")
            
        return self._batch_contexts[batch_id].status
    
    def get_batch_error(self, batch_id: str) -> Optional[str]:
        """Get error message for a failed batch.
        
        Args:
            batch_id: Batch to get error for
            
        Returns:
            Error message or None if no error
            
        Raises:
            ValueError: If batch_id unknown
        """
        if batch_id not in self._batch_contexts:
            raise ValueError(f"Unknown batch: {batch_id}")
            
        return self._batch_contexts[batch_id].error
    
    def start_processing(self, context_id: str) -> None:
        """Start processing a content item.
        
        Args:
            context_id: Identifier for the processing context
        """
        self._processing_stack.add(context_id)
        self.logger.debug(f"Started processing context: {context_id}")
    
    def end_processing(self, context_id: str) -> None:
        """End processing for a content item.
        
        Args:
            context_id: Identifier for the processing context
            
        Raises:
            ValueError: If context_id not being processed
        """
        if context_id not in self._processing_stack:
            raise ValueError(f"Unknown context: {context_id}")
            
        self._processing_stack.remove(context_id)
        self.logger.debug(f"Ended processing context: {context_id}")
    
    def is_processing(self, context_id: str) -> bool:
        """Check if a context is currently processing.
        
        Args:
            context_id: Context to check
            
        Returns:
            True if context is processing, False otherwise
        """
        return context_id in self._processing_stack
    
    def get_current_batch(self) -> Optional[str]:
        """Get ID of current active batch.
        
        Returns:
            Current batch ID or None if no active batch
        """
        return self._current_batch_id
    
    def get_batch_metrics(self, batch_id: str) -> Dict[str, any]:
        """Get processing metrics for a batch.
        
        Args:
            batch_id: Batch to get metrics for
            
        Returns:
            Dictionary of metrics including:
            - status: Current ProcessingStatus
            - keyword_count: Number of keywords
            - duration: Processing duration in seconds
            - error: Optional error message
            
        Raises:
            ValueError: If batch_id unknown
        """
        if batch_id not in self._batch_contexts:
            raise ValueError(f"Unknown batch: {batch_id}")
            
        context = self._batch_contexts[batch_id]
        duration = None
        if context.end_time:
            duration = (context.end_time - context.start_time).total_seconds()
            
        return {
            'status': context.status.value,
            'keyword_count': len(context.keywords),
            'duration': duration,
            'error': context.error
        }
    
    def reset(self) -> None:
        """Reset all state.
        
        This clears all batch contexts and processing state.
        """
        # End any active batches
        if self._current_batch_id:
            self.end_batch(
                self._current_batch_id,
                error="Reset during processing"
            )
        
        # Clear all state
        self._batch_contexts.clear()
        self._current_batch_id = None
        self._processing_stack.clear()
        
        self.logger.info("Reset processing context")