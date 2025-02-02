from typing import Dict, Optional
from datetime import datetime
from bs4 import BeautifulSoup
from urllib.parse import urlparse, ParseResult

from core.domain.content.types import PageStatus
from core.domain.content.models import Page
from core.domain.knowledge.models import Site
from core.domain.content.pipeline import PipelineComponent, ComponentType

class SiteMetadataComponent(PipelineComponent):
    """Extracts and creates/updates site information during page processing."""
    
    def get_component_type(self) -> ComponentType:
        return ComponentType.METADATA

    async def validate(self, page: Page) -> bool:
        return bool(page.url) and bool(page.domain)

    async def process(self, page: Page) -> None:
        """Extract site metadata and create/update Site object."""
        parsed_url = urlparse(page.url)
        soup = BeautifulSoup(page.content, 'html.parser')
        
        # Create or get Site object
        site = self._get_or_create_site(parsed_url, page.domain)
        
        # Update site metadata
        site.name = self._extract_site_name(soup) or site.name
        site.description = self._extract_site_description(soup) or site.description
        site.favicon_url = self._extract_favicon(soup, parsed_url) or site.favicon_url
        
        # Update site timestamps
        site.last_updated = datetime.now()
        
        # Increment page count
        site.increment_page_count()
        
        # Store site reference in page metadata
        page.metadata.custom_metadata['site'] = site

    def _get_or_create_site(self, parsed_url: ParseResult, domain: str) -> Site:
        """Get existing site or create new one."""
        site_url = f"{parsed_url.scheme}://{domain}"
        
        # In a real implementation, this would likely involve
        # checking a cache or database for existing Site objects
        return Site(
            url=site_url,
            domain=domain,
            discovered_at=datetime.now()
        )

    def _extract_site_name(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract site name from various metadata sources."""
        # Try application name
        meta_app_name = soup.find('meta', property='application-name')
        if meta_app_name:
            return meta_app_name.get('content')
            
        # Try site name
        meta_site_name = soup.find('meta', property='og:site_name')
        if meta_site_name:
            return meta_site_name.get('content')
        
        return None

    def _extract_site_description(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract site description."""
        meta_desc = soup.find('meta', {'name': 'description'})
        if meta_desc:
            return meta_desc.get('content')
        return None

    def _extract_favicon(
        self,
        soup: BeautifulSoup,
        parsed_url: ParseResult
    ) -> Optional[str]:
        """Extract favicon URL."""
        favicon = soup.find('link', rel='icon') or soup.find('link', rel='shortcut icon')
        if favicon and favicon.get('href'):
            favicon_url = favicon['href']
            if favicon_url.startswith('/'):
                return f"{parsed_url.scheme}://{parsed_url.netloc}{favicon_url}"
            return favicon_url
        return None

class SiteMetricsComponent(PipelineComponent):
    """Updates site-level metrics based on page processing."""
    
    def get_component_type(self) -> ComponentType:
        return ComponentType.METADATA

    async def validate(self, page: Page) -> bool:
        return (
            bool(page.url) and 
            bool(page.domain) and 
            'site' in page.metadata.custom_metadata
        )

    async def process(self, page: Page) -> None:
        """Update site metrics based on page processing."""
        site: Site = page.metadata.custom_metadata['site']
        
        # Update basic metrics
        site.record_visit()
        
        # Update quality metrics
        quality_score = self._calculate_content_quality(page)
        completeness_score = self._calculate_metadata_completeness(page)
        
        site.update_metadata({
            'content_quality': quality_score,
            'metadata_completeness': completeness_score,
            'last_content_type': page.metadata.custom_metadata.get('content_type'),
            'last_processed_page': page.url
        })

        # Calculate active pages
        if page.status == PageStatus.ACTIVE:
            site.update_metrics(site.active_pages + 1)

    def _calculate_content_quality(self, page: Page) -> float:
        """Calculate content quality score."""
        # Implementation depends on your quality metrics
        # For example:
        scores = []
        if page.title:
            scores.append(1.0)
        if page.keywords:
            scores.append(1.0)
        if page.metadata.metrics.word_count and page.metadata.metrics.word_count > 100:
            scores.append(1.0)
            
        return sum(scores) / len(scores) if scores else 0.0

    def _calculate_metadata_completeness(self, page: Page) -> float:
        """Calculate metadata completeness score."""
        # Implementation depends on your metadata requirements
        # For example:
        required_fields = ['title', 'description', 'keywords']
        present_fields = sum(
            1 for field in required_fields 
            if page.metadata.custom_metadata.get(field)
        )
        return present_fields / len(required_fields)


# Usage in pipeline setup:
# """
# pipeline = DefaultPipelineOrchestrator(context)

# # Register site-aware components
# pipeline.register_component(
#     SiteMetadataComponent(),
#     ProcessingStage.METADATA
# )
# pipeline.register_component(
#     SiteMetricsComponent(),
#     ProcessingStage.ANALYSIS
# )
# """