import pytest
import asyncio
import aiohttp
import logging
from typing import List, Dict, Any
from datetime import datetime
import sys
from pathlib import Path

from core.tools.content.keywords import (
    KeywordExtractor,
    TextCleaner,
    HTMLProcessor
)
from core.tools.content.batching import (
    BatchProcessor,
    ProcessingStatus
)



def setup_test_logging():
    """Configure logging for integration tests"""
    # Create logs directory if it doesn't exist
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Create formatters
    file_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_formatter = logging.Formatter(
        '%(levelname)s - %(name)s - %(message)s'
    )
    
    # Create handlers
    file_handler = logging.FileHandler('logs/integration_test.log')
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(file_formatter)
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Configure specific loggers
    loggers = [
        'core.tools.content.keywords',
        'core.tools.content.batching',
        'test_batching_keyword'
    ]
    
    for logger_name in loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.INFO)


# Test URLs representing different types of content
TEST_URLS = [
    # Static documentation pages
    "https://raw.githubusercontent.com/pytorch/pytorch/master/README.md",
    "https://raw.githubusercontent.com/tensorflow/tensorflow/master/README.md",
    "https://raw.githubusercontent.com/microsoft/vscode/main/README.md",
    
    # Wikipedia pages (these are generally reliable)
    "https://en.wikipedia.org/wiki/Special:Export/Machine_learning",
    "https://en.wikipedia.org/wiki/Special:Export/Artificial_intelligence",
    "https://en.wikipedia.org/wiki/Special:Export/Natural_language_processing",
    
    # MDN Documentation (Mozilla's docs are stable)
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
    "https://developer.mozilla.org/en-US/docs/Web/API/WebSocket_API",
    
    # Python Documentation (using their stable documentation URLs)
    "https://docs.python.org/3/library/asyncio.html",
    "https://docs.python.org/3/library/concurrent.futures.html",
    "https://docs.python.org/3/library/multiprocessing.html"
]

@pytest.fixture(scope="module")
async def http_session():
    """Create shared aiohttp session for tests."""
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        yield session


@pytest.fixture(scope="module")
def keyword_extractor():
    """Create keyword extractor instance."""
    text_cleaner = TextCleaner()
    html_processor = HTMLProcessor(text_cleaner)
    return KeywordExtractor(
        text_cleaner=text_cleaner,
        html_processor=html_processor,
        min_chars=3,
        max_words=4
    )

@pytest.fixture(scope="module")
def batch_processor(keyword_extractor):
    """Create batch processor instance."""
    return BatchProcessor(
        keyword_extractor=keyword_extractor,
        max_workers=4,
        batch_size=5,
        max_retries=2,
        timeout=300
    )

async def fetch_url_content(session: aiohttp.ClientSession, url: str) -> Dict[str, Any]:
    """Fetch content from a URL with error handling."""
    logger = logging.getLogger(__name__)
    logger.info(f"Starting fetch for URL: {url}")
    
    try:
        # Create a timeout context for just this request
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as request_session:
            async with request_session.get(
                url,
                ssl=False,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            ) as response:
                logger.debug(f"Response status for {url}: {response.status}")
                logger.debug(f"Response headers: {response.headers}")
                
                response.raise_for_status()
                content = await response.text()
                
                logger.debug(f"Received content length: {len(content)} bytes")
                if len(content) < 100:  # Log small responses for debugging
                    logger.warning(f"Small content received for {url}: {content}")
                
                await asyncio.sleep(1)  # Rate limiting delay
                
                return {
                    'id': url,
                    'content': content,
                    'source': url,
                    'content_type': response.headers.get('content-type', 'text/html'),
                    'size_bytes': len(content),
                    'timestamp': datetime.now()
                }
                
    except aiohttp.ClientError as e:
        logger.error(f"Network error for {url}: {str(e)}", exc_info=True)
        return create_error_response(url, f"Network error: {str(e)}")
    except asyncio.TimeoutError as e:
        logger.error(f"Timeout error for {url}: {str(e)}", exc_info=True)
        return create_error_response(url, f"Timeout error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error for {url}: {str(e)}", exc_info=True)
        return create_error_response(url, str(e))

def create_error_response(url: str, error: str) -> Dict[str, Any]:
    """Create a standardized error response."""
    return {
        'id': url,
        'content': '',
        'source': url,
        'error': error
    }

@pytest.fixture(scope="session", autouse=True)
def setup_logging():
    """Set up logging for all tests"""
    setup_test_logging()

@pytest.fixture(scope="module")
async def http_session():
    """Create shared aiohttp session for tests."""
    logger = logging.getLogger(__name__)
    logger.info("Creating HTTP session")
    
    timeout = aiohttp.ClientTimeout(total=30)
    connector = aiohttp.TCPConnector(ssl=False, force_close=True)
    
    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    ) as session:
        logger.info("HTTP session created")
        yield session
        logger.info("HTTP session closed")




async def fetch_all_urls(session: aiohttp.ClientSession, urls: List[str]) -> List[Dict[str, Any]]:
    """Fetch content from multiple URLs concurrently."""
    # Create tasks for each URL with rate limiting
    semaphore = asyncio.Semaphore(5)  # Maximum 5 concurrent requests
    
    async def fetch_with_semaphore(url: str) -> Dict[str, Any]:
        async with semaphore:
            return await fetch_url_content(session, url)
    
    # Create and gather tasks
    tasks = [asyncio.create_task(fetch_with_semaphore(url)) for url in urls]
    return await asyncio.gather(*tasks)

@pytest.mark.asyncio
async def test_full_processing_pipeline(http_session, batch_processor):
    """Test complete pipeline from URL fetching through keyword extraction."""
    logger = logging.getLogger(__name__)
    logger.info("Starting full pipeline test")
    
    # Fetch all URL content
    logger.info(f"Fetching {len(TEST_URLS)} URLs")
    documents = await fetch_all_urls(http_session, TEST_URLS)
    
    # Log document statistics
    empty_docs = [doc['id'] for doc in documents if not doc.get('content')]
    error_docs = [doc['id'] for doc in documents if doc.get('error')]
    
    logger.info(f"Fetch results:"
             f"\nTotal documents: {len(documents)}"
             f"\nEmpty documents: {len(empty_docs)}"
             f"\nDocuments with errors: {len(error_docs)}")
    
    if empty_docs:
        logger.warning(f"Empty documents: {empty_docs}")
    if error_docs:
        logger.warning(f"Documents with errors: {error_docs}")
        for doc in documents:
            if doc.get('error'):
                logger.error(f"Error for {doc['id']}: {doc['error']}")
    
    # Continue with processing
    logger.info("Starting batch processing")
    batch_id = await batch_processor.process_documents(documents)
    
    try:
        logger.info("Waiting for batch completion")
        await batch_processor.wait_for_batch_completion(batch_id, timeout=600)
        
        logger.info("Getting batch results")
        results = await batch_processor.get_results(batch_id, include_failed=True)
        
        # Analyze results
        completed_docs = [d for d in results['documents']
                         if d['status'] == ProcessingStatus.COMPLETED]
        failed_docs = [d for d in results['documents']
                      if d['status'] == ProcessingStatus.FAILED]
        
        logger.info(f"Processing results:"
                 f"\nTotal documents: {len(results['documents'])}"
                 f"\nCompleted: {len(completed_docs)}"
                 f"\nFailed: {len(failed_docs)}")
        
        # Log detailed results
        for doc in completed_docs:
            logger.info(f"Successful document {doc['doc_id']}:"
                     f"\n  Keywords: {len(doc['keywords'])}")
            
        for doc in failed_docs:
            logger.error(f"Failed document {doc['doc_id']}:"
                      f"\n  Error: {doc.get('error')}")
        
        # Verify results
        success_rate = len(completed_docs) / len(TEST_URLS)
        logger.info(f"Final success rate: {success_rate:.2%}")
        
        assert success_rate >= 0.8, f"Success rate {success_rate:.2%} below threshold"
        
    except Exception as e:
        logger.error("Test failed with error", exc_info=True)
        raise
    finally:
        logger.info("Test cleanup started")
        # Cleanup code...
        logger.info("Test cleanup completed")


@pytest.mark.asyncio
async def test_category_specific_processing(http_session, batch_processor):
    """Test processing of specific content categories."""
    # Test specific categories separately
    categories = {
        'technical': [url for url in TEST_URLS if 'docs.python.org' in url],
        'documentation': [url for url in TEST_URLS if 'developer.mozilla.org' in url],
        'opensource': [url for url in TEST_URLS if 'githubusercontent.com' in url]
    }
    
    for category, urls in categories.items():
        logging.info(f"Testing {category} category with {len(urls)} URLs")
        
        # Fetch and process category documents
        documents = await fetch_all_urls(http_session, urls)
        batch_id = await batch_processor.process_documents(documents)
        
        try:
            await batch_processor.wait_for_batch_completion(batch_id, timeout=300)
            results = await batch_processor.get_results(batch_id)
            
            # Verify category-specific expectations
            completed_docs = [d for d in results['documents'] 
                            if d['status'] == ProcessingStatus.COMPLETED]
            
            # Log category results
            logging.info(f"{category} results: {len(completed_docs)}/{len(urls)} successful")
            
            # Analyze keyword patterns
            all_keywords = []
            for doc in completed_docs:
                keywords = [kw['keyword'] for kw in doc['keywords']]
                all_keywords.extend(keywords)
                
                # Log top keywords
                sorted_keywords = sorted(doc['keywords'], 
                                      key=lambda k: k['score'], 
                                      reverse=True)
                top_5 = sorted_keywords[:5]
                logging.info(f"Top keywords for {doc['doc_id']}: "
                           f"{[(k['keyword'], k['score']) for k in top_5]}")
            
            # Category-specific assertions
            if category == 'technical':
                # Looking for Python-specific terms
                assert any(kw.lower() in ['python', 'api', 'asyncio'] for kw in all_keywords), \
                    "No Python-related keywords found in technical docs"
                    
            elif category == 'documentation':
                # Looking for web-related terms
                assert any(kw.lower() in ['javascript', 'web', 'api'] for kw in all_keywords), \
                    "No web development keywords found in MDN docs"
                    
            elif category == 'opensource':
                # Looking for project-related terms
                assert any(kw.lower() in ['github', 'repository', 'code'] for kw in all_keywords), \
                    "No repository-related keywords found in GitHub content"
        
        finally:
            # Cleanup
            tasks = [t for t in batch_processor.processing_tasks if not t.done()]
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

@pytest.mark.asyncio
async def test_error_handling_real_data(http_session, batch_processor):
    """Test error handling with real-world data issues."""
    # Test various error cases
    error_cases = [
        # Invalid URL
        "https://nonexistent.example.com",
        # Empty page
        "about:blank",
        # Timeout case (replace with slow responding URL)
        "https://httpstat.us/200?sleep=5000",
        # Various HTTP errors
        "https://httpstat.us/404",
        "https://httpstat.us/500",
        "https://httpstat.us/503"
    ]
    
    documents = await fetch_all_urls(http_session, error_cases)
    batch_id = await batch_processor.process_documents(documents)
    
    try:
        await batch_processor.wait_for_batch_completion(batch_id, timeout=60)
        results = await batch_processor.get_results(batch_id, include_failed=True)
        
        # Verify error handling
        failed_docs = [d for d in results['documents'] 
                      if d['status'] == ProcessingStatus.FAILED]
        
        assert len(failed_docs) > 0, "No failures detected for error cases"
        
        # Check error messages
        for doc in failed_docs:
            assert doc['error'] is not None
            logging.info(f"Error for {doc['doc_id']}: {doc['error']}")
            
    finally:
        # Cleanup
        tasks = [t for t in batch_processor.processing_tasks if not t.done()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)