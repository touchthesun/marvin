import spacy
import asyncio
from datetime import datetime
from core.common.errors import ComponentError
from core.domain.content.processor import ContentProcessor, ContentProcessorConfig
from core.domain.content.models.page import Page
from core.domain.content.validation import KeywordValidator, ValidationConfig
from core.domain.content.keyword_identifier import KeywordNormalizer, VariantManager
from core.domain.content.abbreviations import AbbreviationService
from core.domain.content.models.relationships import RelationshipManager

class TestContentProcessor(ContentProcessor):
    async def process(self, page: Page) -> None:
        """Process page content and update with results."""
        try:
            start_time = datetime.now()
            
            # Get content directly from page
            raw_content = page.content
            self.logger.debug(f"Processing content of length: {len(raw_content) if raw_content else 0}")
            
            if not raw_content:
                raise ComponentError("No content available for processing")
            
            # Clean content based on type
            is_html = '<' in raw_content and '>' in raw_content
            if is_html:
                cleaned_content = self.html_processor.clean_html(raw_content)
            else:
                cleaned_content = self.text_cleaner.normalize_text(raw_content)
            
            self.logger.debug(f"Cleaned content length: {len(cleaned_content)}")
            
            # Store metrics in a way that doesn't use item assignment
            # Use custom_metadata if available
            if hasattr(page.metadata, 'custom_metadata'):
                page.metadata.custom_metadata['cleaned_content'] = cleaned_content
                page.metadata.custom_metadata['content_metrics'] = {
                    'original_length': len(raw_content),
                    'cleaned_length': len(cleaned_content),
                    'is_html': is_html
                }
            
            # Extract keywords using all extractors
            raw_results = await self._extract_keywords(cleaned_content)
            self.logger.debug(f"Raw keyword results: {len(raw_results)} extractor results")

            # Consolidate keyword variants
            consolidated_results = self._consolidate_raw_keywords(raw_results)
            self.logger.debug(f"Consolidated results: {len(consolidated_results)} unique keywords")
    
            # Process keywords
            keywords = self.keyword_processor.process_keywords([consolidated_results])
            self.logger.debug(f"Processed keywords: {len(keywords)} keywords")
            
            # Update page with keywords - assuming there's a method for this
            # and not direct dictionary assignment
            keyword_dict = {
                kw.canonical_text: kw.score
                for kw in keywords
            }
            page.update_keywords(keyword_dict)
            
            # Update processing time using the appropriate method
            processing_time = (datetime.now() - start_time).total_seconds()
            if hasattr(page, 'metrics') and page.metrics:
                page.metrics.processing_time = processing_time
                page.metrics.keyword_count = len(keywords)
            
            self.logger.info(
                f"Processed page {page.url}: {len(keywords)} keywords, "
                f"Content reduced from {len(raw_content)} to {len(cleaned_content)} chars"
            )
            
        except Exception as e:
            self.logger.error(f"Content processing failed: {str(e)}", exc_info=True)
            raise ComponentError(f"Failed to process content: {str(e)}") from e

async def test_extraction():
    # Load spaCy model
    nlp = spacy.load("en_core_web_sm")
    
    # Create supporting services
    normalizer = KeywordNormalizer()
    variant_manager = VariantManager()
    abbreviation_service = AbbreviationService()
    validation_config = ValidationConfig()  # Use default config
    
    # Create validator with all required parameters
    validator = KeywordValidator(
        nlp=nlp,
        config=validation_config,
        abbreviation_service=abbreviation_service
    )
    
    # Create relationship manager
    relationship_manager = RelationshipManager(nlp=nlp)
    
    # Create a test page
    page = Page(url="https://example.com", domain="example.com")
    page.content = """
    Graph databases are NoSQL databases which use graph theory to store, map and query relationships. 
    They are designed for data whose relations are best represented as a graph consisting of 
    elements connected by a finite number of relations. Examples of data include social relations, 
    public transport links, road maps, network topologies, etc.
    """
    
    # Import datetime for the custom processor
    from datetime import datetime
    from core.domain.content.pipeline import ComponentError
    
    # Create custom processor with all dependencies
    processor = TestContentProcessor(
        config=ContentProcessorConfig(),
        nlp=nlp,
        normalizer=normalizer,
        validator=validator,
        relationship_manager=relationship_manager
    )
    
    # Process page - note the await keyword here
    await processor.process(page)
    
    # Check results
    print(f"Keywords: {page.keywords}")
    print(f"Metadata: {page.metadata}")
    print(f"Custom metadata: {page.metadata.custom_metadata if hasattr(page.metadata, 'custom_metadata') else 'N/A'}")

# Run the async function
if __name__ == "__main__":
    asyncio.run(test_extraction())