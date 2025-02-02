import json
from dataclasses import dataclass, field
from typing import Dict, Optional
from bs4 import BeautifulSoup
from datetime import datetime
from core.utils.logger import get_logger
from core.content.page import Page
from core.domain.content.pipeline import (
    PipelineComponent,
    ComponentType,
    ComponentError,
    ValidationError
)



# Metadata extraction configuration
@dataclass
class MetadataConfig:
    """Configuration for metadata extraction.
    
    Attributes:
        quality_threshold: Minimum quality score to consider metadata valid
        required_fields: List of fields that must be present for valid metadata
        max_description_length: Maximum length for description field
    """
    quality_threshold: float = 0.5
    required_fields: list[str] = field(default_factory=lambda: ['title'])
    max_description_length: int = 500

    def __post_init__(self):
        """Validate configuration parameters."""
        if not 0 <= self.quality_threshold <= 1:
            raise ValueError("quality_threshold must be between 0 and 1")
        if self.max_description_length < 1:
            raise ValueError("max_description_length must be positive")

@dataclass
class MetadataQuality:
    """Tracks quality metrics for extracted metadata.
    
    Attributes:
        score: Overall quality score between 0 and 1
        missing_fields: List of required fields that were not found
        required_fields_present: Whether all required fields are present
    """
    score: float
    missing_fields: list[str]
    required_fields_present: bool


class MetadataExtractor(PipelineComponent):
    """Extracts metadata from web pages.
    
    Implements metadata extraction as a pipeline component, handling various
    metadata sources including HTML meta tags, JSON-LD, and OpenGraph.
    """
    
    def __init__(self, config: MetadataConfig):
        """Initialize the extractor."""
        self.config = config
        self.logger = get_logger(__name__)

    def get_component_type(self) -> ComponentType:
        """Get the type of this component."""
        return ComponentType.METADATA

    async def validate(self, page: Page) -> bool:
        """Validate that this component can process the page.
        
        Args:
            page: Page to validate
            
        Returns:
            bool: Whether the page can be processed
            
        Raises:
            ValidationError: If validation fails
        """
        try:
            # Check if we have HTML content to process
            raw_html = page.metadata.get('raw_html')
            if not raw_html:
                raise ValidationError("No HTML content available for metadata extraction")

            # Basic HTML validation
            if '<html' not in raw_html.lower():
                raise ValidationError("Content does not appear to be valid HTML")

            return True

        except Exception as e:
            raise ValidationError(f"Metadata validation failed: {str(e)}") from e

    async def process(self, page: Page) -> None:
        """Process a page and extract metadata.
        
        Args:
            page: Page to process
            
        Raises:
            ComponentError: If processing fails
        """
        try:
            start_time = datetime.now()

            # Get HTML content
            raw_html = page.metadata.get('raw_html')
            if not raw_html:
                raise ComponentError("No HTML content available")

            # Parse HTML
            soup = BeautifulSoup(raw_html, 'html.parser')
            structured_data = self._extract_structured_data(soup)

            # Extract metadata fields
            metadata = {
                'title': self._extract_title(soup, structured_data),
                'description': self._extract_description(soup, structured_data),
                'author': self._extract_author(soup, structured_data),
                'publication_date': self._extract_publication_date(soup, structured_data),
                'language': self._extract_language(soup),
                'extracted_at': datetime.now().isoformat()
            }

            # Calculate quality metrics
            quality = self._evaluate_quality(metadata)
            
            # Update page with extracted metadata and quality information
            metadata['quality'] = {
                'score': quality.score,
                'missing_fields': quality.missing_fields,
                'required_fields_present': quality.required_fields_present
            }
            page.metadata.update(metadata)
            
            # Update page metrics
            if page.metrics:
                page.metrics.quality_score = quality.score

            # Calculate and store processing time
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            if page.metrics:
                page.metrics.processing_time = processing_time

            self.logger.info(
                f"Processed metadata for {page.url} - "
                f"Quality: {quality.score:.2f}, "
                f"Time: {processing_time:.2f}s"
            )

        except Exception as e:
            self.logger.error(f"Metadata extraction failed: {str(e)}")
            raise ComponentError(f"Failed to extract metadata: {str(e)}") from e

    def _extract_structured_data(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Extract structured data from LD+JSON tags."""
        try:
            ld_json_tags = soup.find_all('script', {'type': 'application/ld+json'})
            for tag in ld_json_tags:
                try:
                    data = json.loads(tag.string)
                    if isinstance(data, list):
                        for item in data:
                            if item.get('@type') in ['Article', 'WebPage', 'NewsArticle']:
                                return item
                        return data[0]
                    return data
                except json.JSONDecodeError:
                    continue
            return None
        except Exception as e:
            self.logger.warning(f"Failed to extract structured data: {str(e)}")
            return None

    def _extract_title(self, soup: BeautifulSoup, structured_data: Optional[Dict]) -> Optional[str]:
        """Extract page title using multiple methods."""
        if structured_data and structured_data.get('headline'):
            return structured_data['headline']

        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            return og_title['content'].strip()

        if soup.title and soup.title.string:
            return soup.title.string.strip()

        return None

    def _extract_description(self, soup: BeautifulSoup, structured_data: Optional[Dict]) -> Optional[str]:
        """Extract page description using multiple methods."""
        description = None

        if structured_data and structured_data.get('description'):
            description = structured_data['description']

        if not description:
            og_desc = soup.find('meta', property='og:description')
            if og_desc and og_desc.get('content'):
                description = og_desc['content']

        if not description:
            meta_desc = soup.find('meta', {'name': 'description'})
            if meta_desc and meta_desc.get('content'):
                description = meta_desc['content']

        if description:
            description = description.strip()
            if len(description) > self.config.max_description_length:
                description = description[:self.config.max_description_length] + '...'

        return description

    def _extract_author(self, soup: BeautifulSoup, structured_data: Optional[Dict]) -> Optional[str]:
        """Extract author information using multiple methods."""
        if structured_data and structured_data.get('author'):
            author = structured_data['author']
            if isinstance(author, dict):
                return author.get('name')
            elif isinstance(author, list):
                return ', '.join(a.get('name', '') for a in author if a.get('name'))
            elif isinstance(author, str):
                return author

        for meta_name in ['author', 'article:author', 'og:author', 'twitter:creator']:
            meta_tag = soup.find('meta', {'name': meta_name}) or soup.find('meta', {'property': meta_name})
            if meta_tag and meta_tag.get('content'):
                return meta_tag['content'].strip()

        return None

    def _extract_publication_date(self, soup: BeautifulSoup, structured_data: Optional[Dict]) -> Optional[str]:
        """Extract publication date using multiple methods."""
        if structured_data and structured_data.get('datePublished'):
            return structured_data['datePublished']

        date_meta_tags = [
            {'property': 'article:published_time'},
            {'property': 'og:published_time'},
            {'name': 'publication_date'},
            {'name': 'date'}
        ]

        for tag_attrs in date_meta_tags:
            meta_tag = soup.find('meta', tag_attrs)
            if meta_tag and meta_tag.get('content'):
                return meta_tag['content'].strip()

        return None

    def _extract_language(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract page language."""
        html_tag = soup.find('html')
        if html_tag and html_tag.get('lang'):
            return html_tag['lang'].split('-')[0]

        meta_lang = soup.find('meta', {'name': 'language'}) or soup.find('meta', {'http-equiv': 'content-language'})
        if meta_lang and meta_lang.get('content'):
            return meta_lang['content'].split('-')[0]

        return None

    def _evaluate_quality(self, metadata: Dict) -> MetadataQuality:
        """Evaluate the quality of extracted metadata."""
        missing = [
            field for field in self.config.required_fields 
            if not metadata.get(field)
        ]

        score = 1.0
        score -= len(missing) * 0.2
        score = max(0.0, min(1.0, score))

        return MetadataQuality(
            score=score,
            missing_fields=missing,
            required_fields_present=len(missing) == 0
        )