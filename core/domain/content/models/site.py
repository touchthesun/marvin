from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional
from uuid import UUID, uuid4

@dataclass
class Site:
    """Represents a website root domain in the knowledge graph.
    
    A Site represents the top-level domain that contains multiple pages.
    It maintains information about the domain as a whole rather than
    individual pages.
    """
    # Core identification
    url: str  # Root URL (e.g., "https://example.com")
    domain: str  # Domain name (e.g., "example.com")
    id: UUID = field(default_factory=uuid4)
    
    # Metadata
    name: Optional[str] = None  # Site name (e.g., from meta tags)
    description: Optional[str] = None
    favicon_url: Optional[str] = None
    
    # Timestamps
    discovered_at: datetime = field(default_factory=datetime.now)
    last_updated: Optional[datetime] = None
    last_crawled: Optional[datetime] = None
    
    # Site metrics
    page_count: int = 0
    active_pages: int = 0
    total_visits: int = 0
    
    # Additional metadata
    metadata: Dict = field(default_factory=dict)

    def __post_init__(self):
        """Validate and initialize the site object."""
        if not self.url:
            raise ValueError("URL is required")
        if not self.domain:
            raise ValueError("Domain is required")

    def update_metrics(self, active_pages: int):
        """Update site metrics."""
        self.active_pages = active_pages
        self.last_updated = datetime.now()

    def increment_page_count(self):
        """Increment the total page count."""
        self.page_count += 1
        self.last_updated = datetime.now()

    def record_visit(self):
        """Record a visit to any page in the site."""
        self.total_visits += 1
        self.last_updated = datetime.now()

    def update_metadata(self, metadata: Dict):
        """Update site metadata."""
        self.metadata.update(metadata)
        self.last_updated = datetime.now()

    def to_dict(self) -> Dict:
        """Convert site to dictionary representation."""
        return {
            'id': str(self.id),
            'url': self.url,
            'domain': self.domain,
            'name': self.name,
            'description': self.description,
            'favicon_url': self.favicon_url,
            'discovered_at': self.discovered_at.isoformat(),
            'last_updated': self.last_updated.isoformat() if self.last_updated else None,
            'last_crawled': self.last_crawled.isoformat() if self.last_crawled else None,
            'page_count': self.page_count,
            'active_pages': self.active_pages,
            'total_visits': self.total_visits,
            'metadata': self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'Site':
        """Create a Site instance from a dictionary."""
        # Handle datetime fields
        discovered_at = datetime.fromisoformat(data.pop('discovered_at'))
        last_updated = datetime.fromisoformat(data['last_updated']) if data.get('last_updated') else None
        last_crawled = datetime.fromisoformat(data['last_crawled']) if data.get('last_crawled') else None
        
        return cls(
            discovered_at=discovered_at,
            last_updated=last_updated,
            last_crawled=last_crawled,
            **{k: v for k, v in data.items() if k not in ['last_updated', 'last_crawled']}
        )