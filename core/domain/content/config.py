from dataclasses import dataclass, field
from typing import List

from core.domain.content.extractors import ExtractorConfig


@dataclass
class ContentProcessorConfig:
    """Configuration for content processing component.
    
    Attributes:
        min_content_length: Minimum length for meaningful content
        min_keyword_score: Minimum score to include keyword
        max_variants: Maximum number of variants per keyword
        enable_stemming: Whether to use stemming in normalization
        extractor_config: Configuration for keyword extractors
    """ 
    min_content_length: int = 100
    min_keyword_score: float = 0.3
    max_variants: int = 5
    enable_stemming: bool = True
    relationship_confidence_threshold: float = 0.5
    # Content extraction settings
    extract_content: bool = True  # Enable/disable content extraction
    content_extraction_timeout: float = 2.0  # Seconds before timing out
    max_content_length: int = 500000  # Cap on content storage size
    
    # Site complexity thresholds
    complex_dom_threshold: int = 1000  # Number of elements that indicates complexity
    max_js_scripts: int = 20  # Max scripts before considering too complex
    skip_domains: List[str] = field(default_factory=lambda: [
        "facebook.com", "twitter.com", "instagram.com", 
        "gmail.com", "app.slack.com", "aws.amazon.com"
    ])
    extractor_config: ExtractorConfig = ExtractorConfig(
        min_chars=3,
        max_words=4,
        min_frequency=1,
        min_keyword_score=0.25,
        score_threshold=0.5
    )

    def __post_init__(self):
        """Validate configuration parameters."""
        if self.min_content_length < 0:
            raise ValueError("min_content_length must be non-negative")
        if not 0 <= self.min_keyword_score <= 1:
            raise ValueError("min_keyword_score must be between 0 and 1")
        if self.max_variants < 1:
            raise ValueError("max_variants must be positive")