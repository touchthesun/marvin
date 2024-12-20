from dataclasses import dataclass
from typing import Dict, List, Optional
from datetime import datetime
from bs4 import BeautifulSoup
from newspaper import Article
from utils.logger import get_logger
from core.knowledge.neo4j import GraphManager
import json
import asyncio

@dataclass
class MetadataSource:
    """Tracks where each piece of metadata came from"""
    value: str
    source: str  # 'ld_json', 'meta_tag', 'og_tag', 'article_parser', etc.
    confidence: float

@dataclass
class MetadataQuality:
    score: float
    missing_fields: List[str]
    sources: Dict[str, str]  # field -> source mapping
    required_fields_present: bool

class MetadataExtractor:
    REQUIRED_FIELDS = ['title', 'content', 'publication_date']
    
    def __init__(self):
        self.logger = get_logger(__name__)
        self.graph_manager = GraphManager()

    async def process_url(self, url: str, html_content: str) -> Dict:
        """Main entry point for processing a URL"""
        try:
            metadata = await self.extract_metadata(url, html_content)
            quality = self._evaluate_quality(metadata)
            
            if quality.score > 0.5:  # Configurable threshold
                await self._store_in_graph(url, metadata, quality)
            else:
                self.logger.warning(f"Low quality metadata for {url}: {quality.score}")
            
            return {
                "metadata": metadata,
                "quality": quality.__dict__
            }
        
        except Exception as e:
            self.logger.error(f"Error processing {url}: {e}")
            raise

    async def extract_metadata(self, url: str, html_content: str) -> Dict:
        """Extract all metadata from a page"""
        soup = BeautifulSoup(html_content, 'html.parser')
    
        structured_data = self._extract_structured_data(soup)
        
        metadata = {
            'url': url,
            'extracted_at': datetime.utcnow().isoformat(),
            'sources': {}
        }

        extraction_tasks = [
            self._extract_title(soup, structured_data),
            self._extract_author(soup, structured_data),
            self._extract_publication_date(soup, structured_data),
            self._extract_content(soup, structured_data),
            self._extract_description(soup, structured_data)
        ]
        
        # Run all extractions concurrently
        results = await asyncio.gather(*extraction_tasks)
        
        # Map results to metadata
        field_names = ['title', 'author', 'publication_date', 'content', 'description']
        for field_name, result in zip(field_names, results):
            metadata[field_name] = result.value
            metadata['sources'][field_name] = {
                'source': result.source,
                'confidence': result.confidence
            }

        return metadata


    def _evaluate_quality(self, metadata: Dict) -> MetadataQuality:
        """Evaluate the quality of extracted metadata"""
        missing = [f for f in self.REQUIRED_FIELDS if not metadata.get(f)]
        sources = {k: v['source'] for k, v in metadata.get('sources', {}).items()}
        
        # Calculate base score
        score = 1.0
        
        # Deduct for missing required fields
        score -= len(missing) * 0.2
        
        # Adjust for source quality
        for field, source_info in metadata.get('sources', {}).items():
            if source_info['source'] == 'ld_json':
                score += 0.1
            elif source_info['source'] == 'meta_tag':
                score += 0.05
                
        # Normalize score
        score = max(0.0, min(1.0, score))
        
        return MetadataQuality(
            score=score,
            missing_fields=missing,
            sources=sources,
            required_fields_present=len(missing) == 0
        )

    async def _store_in_graph(self, url: str, metadata: Dict, quality: MetadataQuality):
        """Store extracted metadata in Neo4j"""
        # Extract domain for Site node
        domain = self._extract_domain(url)
        
        # Create or update Site node
        site = await self.graph_manager.create_site(
            url=domain,
            name=domain,
            description=None
        )
        
        # Create or update Page node
        page = await self.graph_manager.create_page(
            url=url,
            title=metadata.get('title', 'Untitled'),
            content_summary=metadata.get('description', ''),
            site_url=domain,
            metadata={
                'author': metadata.get('author'),
                'publication_date': metadata.get('publication_date'),
                'metadata_quality_score': quality.score,
                'extraction_sources': metadata['sources'],
                'extracted_at': metadata['extracted_at']
            }
        )
        
        return page

    # Helper methods for specific metadata extraction
    async def _extract_title(self, soup: BeautifulSoup, structured_data: Dict) -> MetadataSource:
        """Extract title with source tracking"""
        # Try structured data first
        if structured_data.get('headline'):
            return MetadataSource(
                value=structured_data['headline'],
                source='ld_json',
                confidence=0.9
            )

        # Try OpenGraph
        og_title = soup.find('meta', property='og:title')
        if og_title:
            return MetadataSource(
                value=og_title['content'],
                source='og_tag',
                confidence=0.8
            )

        # Fall back to title tag
        if soup.title:
            return MetadataSource(
                value=soup.title.string.strip(),
                source='title_tag',
                confidence=0.6
            )

        return MetadataSource(
            value='Untitled',
            source='default',
            confidence=0.0
        )

    async def _extract_author(self, soup: BeautifulSoup, structured_data: Dict) -> MetadataSource:
        """Extract author information with source tracking"""
        # Try structured data first
        if structured_data.get('author'):
            author = structured_data['author']
            if isinstance(author, dict):
                author = author.get('name', '')
            elif isinstance(author, list):
                author = ', '.join([a.get('name', '') for a in author])
            
            if author:
                return MetadataSource(
                    value=author,
                    source='ld_json',
                    confidence=0.9
                )

        # Try meta tags
        for meta_name in ['author', 'article:author', 'og:author', 'twitter:creator']:
            meta_tag = soup.find('meta', {'name': meta_name}) or soup.find('meta', {'property': meta_name})
            if meta_tag and meta_tag.get('content'):
                return MetadataSource(
                    value=meta_tag['content'].strip(),
                    source='meta_tag',
                    confidence=0.7
                )

        return MetadataSource(
            value='Unknown Author',
            source='default',
            confidence=0.0
        )

    async def _extract_publication_date(self, soup: BeautifulSoup, structured_data: Dict) -> MetadataSource:
        """Extract publication date with source tracking"""
        # Try structured data first
        if structured_data.get('datePublished'):
            return MetadataSource(
                value=structured_data['datePublished'],
                source='ld_json',
                confidence=0.9
            )

        # Try various meta tags
        date_meta_tags = [
            {'property': 'article:published_time'},
            {'property': 'og:published_time'},
            {'name': 'publication_date'},
            {'name': 'date'},
            {'name': 'DC.date.issued'}
        ]

        for tag_attrs in date_meta_tags:
            meta_tag = soup.find('meta', tag_attrs)
            if meta_tag and meta_tag.get('content'):
                return MetadataSource(
                    value=meta_tag['content'].strip(),
                    source='meta_tag',
                    confidence=0.7
                )

        return MetadataSource(
            value=None,
            source='default',
            confidence=0.0
        )

    async def _extract_content(self, soup: BeautifulSoup, structured_data: Dict) -> MetadataSource:
        """Extract main content using multiple methods"""
        try:
            # Try newspaper3k first as it's usually most reliable
            article = Article('')  # URL not needed as we already have the HTML
            article.download_state = 2  # Skip download
            article.html = str(soup)
            article.parse()
            
            if article.text and len(article.text.strip()) > 100:
                return MetadataSource(
                    value=article.text.strip(),
                    source='article_parser',
                    confidence=0.8
                )

            # Fallback to structured data
            if structured_data.get('articleBody'):
                return MetadataSource(
                    value=structured_data['articleBody'],
                    source='ld_json',
                    confidence=0.9
                )

            # Final fallback to basic content extraction
            paragraphs = soup.find_all('p')
            content = ' '.join(p.get_text().strip() for p in paragraphs)
            if len(content) > 100:
                return MetadataSource(
                    value=content,
                    source='html_parser',
                    confidence=0.5
                )

            return MetadataSource(
                value='',
                source='default',
                confidence=0.0
            )

        except Exception as e:
            self.logger.error(f"Error extracting content: {e}")
            return MetadataSource(
                value='',
                source='error',
                confidence=0.0
            )

    async def _extract_description(self, soup: BeautifulSoup, structured_data: Dict) -> MetadataSource:
        """Extract page description with source tracking"""
        # Try structured data first
        if structured_data.get('description'):
            return MetadataSource(
                value=structured_data['description'],
                source='ld_json',
                confidence=0.9
            )

        # Try OpenGraph
        og_desc = soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            return MetadataSource(
                value=og_desc['content'].strip(),
                source='og_tag',
                confidence=0.8
            )

        # Try meta description
        meta_desc = soup.find('meta', {'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            return MetadataSource(
                value=meta_desc['content'].strip(),
                source='meta_tag',
                confidence=0.7
            )

        # If we have content, create a brief summary
        content = soup.find_all('p')
        if content:
            first_paragraphs = ' '.join(p.get_text().strip() for p in content[:2])
            if len(first_paragraphs) > 50:
                return MetadataSource(
                    value=first_paragraphs[:200] + '...',
                    source='content_summary',
                    confidence=0.3
                )

        return MetadataSource(
            value='No description available',
            source='default',
            confidence=0.0
        )


    def _extract_structured_data(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Extract and process structured data from LD+JSON"""
        try:
            ld_json_tags = soup.find_all('script', {'type': 'application/ld+json'})
            for tag in ld_json_tags:
                try:
                    data = json.loads(tag.string)
                    # Handle single object or array of objects
                    if isinstance(data, list):
                        # Try to find the most relevant object (usually article or webpage)
                        for item in data:
                            if item.get('@type') in ['Article', 'WebPage', 'NewsArticle']:
                                return item
                        return data[0]  # Fall back to first item if no relevant type found
                    return data
                except json.JSONDecodeError:
                    continue
            
            return None
        
        except Exception as e:
            self.logger.error(f"Error extracting structured data: {e}")
            return None

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        from urllib.parse import urlparse
        try:
            parsed_url = urlparse(url)
            return parsed_url.netloc
        except Exception as e:
            self.logger.error(f"Error extracting domain from {url}: {e}")
            return url