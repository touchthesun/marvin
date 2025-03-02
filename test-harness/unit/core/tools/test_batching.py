import pytest
import asyncio
from unittest.mock import Mock
from core.tools.content.batching import (
    BatchProcessor, 
    ProcessingStatus, 
    BatchMetadata
)

@pytest.fixture
def keyword_extractor_mock():
    """Mock keyword extractor for testing"""
    mock = Mock()
    mock.extract_keywords_hybrid.return_value = [
        Mock(
            keyword="test keyword",
            score=0.8,
            frequency=1,
            length=2,
            source="test",
            keyword_type="concept",
            related_terms=["related1", "related2"]
        )
    ]
    return mock

@pytest.fixture
def batch_processor(keyword_extractor_mock):
    """Create BatchProcessor instance with mocked dependencies"""
    return BatchProcessor(
        keyword_extractor=keyword_extractor_mock,
        max_workers=2,
        batch_size=5,
        max_retries=2,
        timeout=30
    )

@pytest.mark.asyncio
async def test_process_documents_basic(batch_processor):
    """Test basic document processing workflow"""
    documents = [
        {
            'id': 'doc1',
            'content': 'Test content 1',
            'source': 'test',
            'content_type': 'text/plain'
        },
        {
            'id': 'doc2',
            'content': 'Test content 2',
            'source': 'test',
            'content_type': 'text/plain'
        }
    ]
    
    # Process documents
    batch_id = await batch_processor.process_documents(documents)
    
    # Wait for processing to complete
    await batch_processor.wait_for_batch_completion(batch_id, timeout=5)
    
    # Verify batch metadata
    batch_meta = batch_processor.active_batches[batch_id]
    assert batch_meta.total_docs == 2
    assert batch_meta.completed_docs == 2
    assert batch_meta.status == ProcessingStatus.COMPLETED
    
    # Verify document status
    for doc in documents:
        doc_meta = batch_processor.documents_in_process[doc['id']]
        assert doc_meta.status == ProcessingStatus.COMPLETED
        assert doc_meta.error is None

@pytest.mark.asyncio
async def test_process_document_success(batch_processor):
    """Test successful processing of a single document"""
    doc = {
        'id': 'doc1',
        'content': 'Test content',
        'source': 'test',
        'content_type': 'text/plain'
    }
    
    result = batch_processor._process_document(doc)
    
    assert result['status'] == ProcessingStatus.COMPLETED
    assert result['doc_id'] == 'doc1'
    assert len(result['keywords']) > 0
    assert result['error'] is None
    assert isinstance(result['processing_time'], float)
    
    # Verify keyword extractor was called
    batch_processor.keyword_extractor.extract_keywords_hybrid.assert_called_once_with('Test content')

@pytest.mark.asyncio
async def test_process_document_empty_content(batch_processor):
    """Test handling of empty document content"""
    doc = {
        'id': 'doc1',
        'content': '',
        'source': 'test',
        'content_type': 'text/plain'
    }
    
    result = batch_processor._process_document(doc)
    
    assert result['status'] == ProcessingStatus.FAILED
    assert 'Empty document content' in result['error']

@pytest.mark.asyncio
async def test_get_batch_status(batch_processor):
    """Test batch status retrieval"""
    documents = [{'id': 'doc1', 'content': 'test'}]
    batch_id = await batch_processor.process_documents(documents)
    
    # Get status immediately
    status = await batch_processor.get_batch_status(batch_id)
    assert isinstance(status, BatchMetadata)
    assert status.batch_id == batch_id
    assert status.total_docs == 1
    
    # Wait for completion
    await batch_processor.wait_for_batch_completion(batch_id, timeout=5)
    
    # Get final status
    final_status = await batch_processor.get_batch_status(batch_id)
    assert final_status.status == ProcessingStatus.COMPLETED
    assert final_status.completed_docs == 1

@pytest.mark.asyncio
async def test_get_document_status(batch_processor):
    """Test document status retrieval"""
    doc = {'id': 'doc1', 'content': 'test'}
    batch_id = await batch_processor.process_documents([doc])
    
    # Get initial status
    initial_status = await batch_processor.get_document_status('doc1')
    assert initial_status.doc_id == 'doc1'
    assert initial_status.batch_id == batch_id
    
    # Wait for completion
    await batch_processor.wait_for_batch_completion(batch_id, timeout=5)
    
    # Get final status
    final_status = await batch_processor.get_document_status('doc1')
    assert final_status.status == ProcessingStatus.COMPLETED
    assert final_status.error is None

@pytest.mark.asyncio
async def test_get_results(batch_processor):
    """Test batch results retrieval"""
    documents = [
        {'id': 'doc1', 'content': 'test1'},
        {'id': 'doc2', 'content': 'test2'}
    ]
    batch_id = await batch_processor.process_documents(documents)
    
    # Wait for processing to complete
    await batch_processor.wait_for_batch_completion(batch_id, timeout=5)
    
    # Get results
    results = await batch_processor.get_results(batch_id)
    
    assert results['batch_id'] == batch_id
    assert results['total_docs'] == 2
    assert isinstance(results['documents'], list)
    assert len(results['documents']) == 2
    
    # Verify document results
    for doc in results['documents']:
        assert doc['status'] == ProcessingStatus.COMPLETED
        assert len(doc['keywords']) > 0
        assert doc['error'] is None

@pytest.mark.asyncio
async def test_error_handling(batch_processor, keyword_extractor_mock):
    """Test error handling during processing"""
    # Make keyword extractor raise an error
    keyword_extractor_mock.extract_keywords_hybrid.side_effect = Exception("Test error")
    
    doc = {'id': 'doc1', 'content': 'test'}
    batch_id = await batch_processor.process_documents([doc])
    
    # Wait for processing to complete
    await batch_processor.wait_for_batch_completion(batch_id, timeout=5)
    
    # Check document status
    doc_status = await batch_processor.get_document_status('doc1')
    assert doc_status.status == ProcessingStatus.FAILED
    assert 'Test error' in doc_status.error

@pytest.mark.asyncio
async def test_retry_logic(batch_processor, keyword_extractor_mock):
    """Test retry logic for failed processing"""
    # Make keyword extractor fail once then succeed
    keyword_extractor_mock.extract_keywords_hybrid.side_effect = [
        Exception("First attempt"),
        [Mock(
            keyword="test keyword",
            score=0.8,
            frequency=1,
            length=2,
            source="test",
            keyword_type="concept",
            related_terms=["related1", "related2"]
        )]
    ]
    
    doc = {'id': 'doc1', 'content': 'test'}
    batch_id = await batch_processor.process_documents([doc])
    
    # Wait for processing to complete
    await batch_processor.wait_for_batch_completion(batch_id, timeout=5)
    
    # Check document status
    doc_status = await batch_processor.get_document_status('doc1')
    assert doc_status.status == ProcessingStatus.COMPLETED
    assert doc_status.error is None

@pytest.mark.asyncio
async def test_concurrent_processing(batch_processor):
    """Test concurrent processing of multiple documents"""
    documents = [
        {'id': f'doc{i}', 'content': f'test{i}'} 
        for i in range(10)
    ]
    
    batch_id = await batch_processor.process_documents(documents)
    
    # Wait for processing to complete
    await batch_processor.wait_for_batch_completion(batch_id, timeout=15)
    
    # Get results
    results = await batch_processor.get_results(batch_id)
    
    assert results['total_docs'] == 10
    assert len(results['documents']) == 10
    assert all(doc['status'] == ProcessingStatus.COMPLETED for doc in results['documents'])

@pytest.fixture(autouse=True)
async def cleanup():
    """Cleanup fixture to ensure proper test cleanup"""
    yield
    # Clean up any pending tasks after each test
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)