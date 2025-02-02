import asyncio
from datetime import datetime
from dataclasses import dataclass
import math

from typing import List, Dict, Optional
from .types import (
    RawKeyword, KeywordType, ProcessingError
)
from .keyword_identifier import (
    KeywordIdentifier,
    KeywordNormalizer,
    VariantManager
)
from .models.relationships import RelationshipManager
from .text_processing import TextCleaner, HTMLProcessor
from .extractors import (
    ExtractorConfig,
    RakeExtractor,
    TfidfExtractor,
    NamedEntityExtractor,
    BaseExtractor
)
from .validation import KeywordValidator
from core.utils.logger import get_logger
from core.domain.content.pipeline import (
    PipelineComponent,
    ComponentType,
    ComponentError,
    ValidationError
)
from core.content.page import Page
from core.utils.logger import get_logger


logger = get_logger(__name__)

@dataclass
class ProcessorConfig:
    """Configuration for keyword processing pipeline.
    
    Attributes:
        min_score: Minimum score to include keyword
        max_variants: Maximum number of variants per keyword
        enable_stemming: Whether to use stemming in normalization
    """
    min_score: float = 0.3
    max_variants: int = 5
    enable_stemming: bool = True

    def __post_init__(self):
        """Validate configuration parameters."""
        if not 0 <= self.min_score <= 1:
            raise ValueError("min_score must be between 0 and 1")
        if self.max_variants < 1:
            raise ValueError("max_variants must be positive")



class KeywordProcessor:
    """Processes raw keywords into normalized, deduplicated form.
    
    This class handles:
    - Keyword normalization and variant detection
    - Score normalization
    - Keyword type inference
    - Creation of KeywordIdentifier instances
    """
    
    def __init__(self,
                 config: ProcessorConfig,
                 normalizer: KeywordNormalizer,
                 variant_manager: VariantManager,
                 validator: KeywordValidator):
        """Initialize with required dependencies.
        
        Args:
            config: Processing configuration
            normalizer: Text normalization service
            variant_manager: Variant handling service
        """
        self.config = config
        self.normalizer = normalizer
        self.variant_manager = variant_manager
        self.validator = validator
        self.logger = get_logger(__name__)

    def process_keywords(self,
                        raw_results: List[List[RawKeyword]]
                        ) -> List[KeywordIdentifier]:
        """Process raw keywords into normalized form.
        
        Args:
            raw_results: Raw keywords from multiple extractors
            
        Returns:
            List of processed KeywordIdentifier instances
        
        Raises:
            ProcessingError: If processing fails
        """
        try:
            # Group by normalized text
            grouped_keywords = self._group_by_normalized_text(raw_results)
            
            # Process each group into a KeywordIdentifier
            processed_keywords = []
            seen_canonical_forms = set()
            
            for norm_text, keywords in grouped_keywords.items():
                # Get canonical form and variants
                variants = {kw.text for kw in keywords}
                canonical = self.variant_manager.get_canonical_form(variants)
                
                # Skip if we've already processed this canonical form
                if canonical in seen_canonical_forms:
                    continue
                    
                seen_canonical_forms.add(canonical)
                
                # Calculate normalized score
                score = self._calculate_score(keywords)
                if score < self.config.min_score:
                    continue
                
                # Create identifier with canonical form
                identifier = KeywordIdentifier(
                    text=canonical,
                    canonical_text=canonical,
                    normalized_text=norm_text,
                    variants=variants,
                    keyword_type=self._infer_type(keywords),
                    score=round(score, 2)
                )
                
                if self.validator.is_valid(identifier):
                    processed_keywords.append(identifier)
                else:
                    self.logger.debug(
                        f"Keyword '{identifier.canonical_text}' failed validation"
                    )
            
            self.logger.info(
                f"Processed {sum(len(r) for r in raw_results)} raw keywords "
                f"into {len(processed_keywords)} unique keywords"
            )
            
            return processed_keywords
            
        except Exception as e:
            self.logger.error(f"Keyword processing failed: {e}", exc_info=True)
            raise ProcessingError(f"Failed to process keywords: {str(e)}")

    def _group_by_normalized_text(self,
                                raw_results: List[List[RawKeyword]]
                                ) -> Dict[str, List[RawKeyword]]:
        """Group keywords by their normalized text form."""
        grouped = {}
        for result_set in raw_results:
            for keyword in result_set:
                norm_text = self.normalizer.normalize(keyword.text)
                if norm_text not in grouped:
                    grouped[norm_text] = []
                grouped[norm_text].append(keyword)
        return grouped

    def _calculate_score(self, keywords: List[RawKeyword]) -> float:
        """
        Debug-enhanced scoring mechanism to understand score calculation.
        """
        if not keywords:
            return 0.0
        
        # More moderate scoring parameters
        CONFIDENCE_THRESHOLD = 0.4  # Lower threshold to allow more keywords
        SOURCE_DECAY_RATE = 0.7     # Softer decay for repeated sources
        MAX_SOURCES = 5             # Increase max sources considered
        
        # Initialize source_scores as an empty dictionary
        source_scores = {}
        total_weight = 0
        total_score = 0
        
        # Add debug logging
        self.logger.debug(f"Starting score calculation for {len(keywords)} keywords")
        
        # Sort keywords by score to prioritize high-confidence entries
        sorted_keywords = sorted(keywords, key=lambda kw: kw.score, reverse=True)
        
        for kw in sorted_keywords:
            # Debug log for each keyword
            self.logger.debug(f"Processing keyword: {kw.text}")
            self.logger.debug(f"  Original score: {kw.score}")
            self.logger.debug(f"  Frequency: {kw.frequency}")
            self.logger.debug(f"  Source: {kw.source}")
            
            # Skip extremely low-confidence keywords
            if kw.score < CONFIDENCE_THRESHOLD:
                self.logger.debug(f"  Skipping - below confidence threshold")
                continue
            
            # Limit sources, but be more lenient
            if len(source_scores) >= MAX_SOURCES:
                self.logger.debug(f"  Reached max sources limit")
                break
            
            # Softer decay for source repetition
            source_weight = SOURCE_DECAY_RATE ** len(source_scores)
            
            # Combine score components
            combined_score = (
                kw.score * 0.6 +  # Extractor confidence
                (kw.frequency / max(1, kw.frequency)) * 0.4  # Frequency normalization
            )
            
            # Accumulate scores with weighted contribution
            total_score += combined_score * source_weight
            total_weight += source_weight
            
            # Track source
            source_scores[kw.source] = combined_score
            
            # Debug log for this iteration's calculations
            self.logger.debug(f"  Combined score: {combined_score}")
            self.logger.debug(f"  Source weight: {source_weight}")
            self.logger.debug(f"  Current total score: {total_score}")
            self.logger.debug(f"  Current total weight: {total_weight}")
        
        # Normalize score with a slightly higher baseline
        normalized_score = min(1.0, max(0.0, total_score / total_weight)) if total_weight > 0 else 0.0
        
        # Final debug logging
        self.logger.debug(f"Final normalized score: {normalized_score}")
        
        return normalized_score if normalized_score > 0.3 else 0.0

    def _infer_type(self, keywords: List[RawKeyword]) -> KeywordType:
        """Infer the type of a keyword group."""
        # Prioritize explicit type information
        for kw in keywords:
            if 'keyword_type' in kw.metadata:
                return KeywordType(kw.metadata['keyword_type'])
        
        # Infer from characteristics
        text = keywords[0].text
        if len(text.split()) > 2:
            return KeywordType.CONCEPT
        
        return KeywordType.TERM



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
    extractor_config: ExtractorConfig = ExtractorConfig(
        min_chars=3,
        max_words=4,
        min_frequency=1,
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

class ContentProcessor(PipelineComponent):
    """Content processing pipeline component.
    
    Processes page content to extract and analyze keywords, managing the complete
    pipeline from extraction through relationship detection.
    """
    
    def __init__(
        self,
        config: ContentProcessorConfig,
        keyword_processor: Optional[KeywordProcessor] = None,
        relationship_manager: Optional[RelationshipManager] = None,
        normalizer: Optional[KeywordNormalizer] = None,
        validator: Optional[KeywordValidator] = None,
        nlp=None
    ):
        """Initialize with required dependencies."""
        self.config = config
        self.logger = get_logger(__name__)
        
        # Initialize text processing
        self.nlp = nlp
        self.text_cleaner = TextCleaner()
        self.html_processor = HTMLProcessor(self.text_cleaner)
        
        # Initialize or use provided components
        self.keyword_processor = keyword_processor or KeywordProcessor(
            config=config,
            normalizer=normalizer or KeywordNormalizer(),
            variant_manager=VariantManager(),
            validator=validator or KeywordValidator(nlp=nlp)
        )
        
        self.relationship_manager = relationship_manager or RelationshipManager(nlp)
        
        # Initialize extractors
        self.extractors: List[BaseExtractor] = [
            RakeExtractor(config.extractor_config, self.keyword_processor.normalizer),
            TfidfExtractor(config.extractor_config, self.keyword_processor.normalizer),
            NamedEntityExtractor(config.extractor_config, self.keyword_processor.normalizer, nlp)
        ]

    def get_component_type(self) -> ComponentType:
        """Get the type of this component."""
        return ComponentType.CONTENT


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
            # Check for content directly on page
            if not page.content:
                raise ValidationError("No content available for processing")
            
            # Get clean content length
            is_html = '<' in page.content and '>' in page.content
            if is_html:
                cleaned_content = self.html_processor.clean_html(page.content)
            else:
                cleaned_content = self.text_cleaner.normalize_text(page.content)
            
            if len(cleaned_content) < self.config.min_content_length:
                raise ValidationError(
                    f"Cleaned content length ({len(cleaned_content)}) below minimum "
                    f"threshold ({self.config.min_content_length})"
                )
            
            return True
                
        except Exception as e:
            raise ValidationError(f"Content validation failed: {str(e)}") from e



    def _consolidate_raw_keywords(self, raw_results: List[List[RawKeyword]]) -> List[RawKeyword]:
        """Consolidate raw keywords from multiple extractors.
        
        Args:
            raw_results: List of keyword lists from different extractors
            
        Returns:
            List of consolidated RawKeyword instances
        """
        # First flatten all results
        all_keywords = [kw for extractor_results in raw_results for kw in extractor_results]
        self.logger.debug(f"Pre-consolidation keywords: {[kw.text for kw in all_keywords]}")
        
        # Group by lemmatized form
        consolidated = {}
        for keyword in all_keywords:
            # Process with spaCy to get lemma
            doc = self.nlp(keyword.text)
            # Get lemmatized form, preserving multi-word phrases
            lemma_parts = [token.lemma_ for token in doc]
            lemma_key = ' '.join(lemma_parts)
            
            if lemma_key not in consolidated:
                consolidated[lemma_key] = keyword
                consolidated[lemma_key].variants = {keyword.text}
            else:
                # Update existing entry
                existing = consolidated[lemma_key]
                existing.variants.add(keyword.text)
                existing.frequency += keyword.frequency
                existing.score = max(existing.score, keyword.score)
                existing.positions.extend(keyword.positions)
                existing.metadata.update(keyword.metadata)
        
        result = list(consolidated.values())
        self.logger.debug(f"Post-consolidation keywords: {[kw.text for kw in result]}")
        return result



    async def process(self, page: Page) -> None:
        """Process page content and update with results.
        
        Args:
            page: Page to process
            
        Raises:
            ComponentError: If processing fails
        """
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

            
            
            # Store cleaned content in page metadata for future use
            page.metadata['cleaned_content'] = cleaned_content
            page.metadata['content_metrics'] = {
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
            
            # Store cleaned content in context for relationship detection
            context = {
                'cleaned_content': cleaned_content,
                'original_url': page.url,
                'document_id': str(page.id)
            }

            # Prepare keywords for relationship detection
            keyword_dicts = [
                {
                    'id': kw.id,
                    'canonical_text': kw.canonical_text,
                    'keyword_type': kw.keyword_type,
                    'document_id': str(page.id)
                } for kw in keywords
            ]
            # Register keywords with original text for relationship tracking
            for kw in keywords:
                self.relationship_manager.register_keyword(
                    keyword_id=kw.id, 
                    keyword_type=kw.keyword_type,
                    original_text=kw.canonical_text
                )
            
            # Detect relationships
            self.relationship_manager.detect_relationships(keyword_dicts, context)
            
            # Prepare relationships for storage
            relationships = self.relationship_manager.prepare_neo4j_relationships(
                min_confidence=self.config.relationship_confidence_threshold
            )
            # Process relationships
            for kw in keywords:
                self.relationship_manager.register_keyword(kw.id, kw.keyword_type)
            
            # Update page with results
            page.update_keywords({
                kw.canonical_text: kw.score  # Use the actual calculated score
                for kw in keywords
            })
            
            # Store relationships in page metadata
            page.metadata['relationships'] = relationships
            
            # Add processing time to page metrics
            processing_time = (datetime.now() - start_time).total_seconds()
            if page.metrics:
                page.metrics.processing_time = processing_time
                page.metrics.keyword_count = len(keywords)
            
            self.logger.info(
                f"Processed page {page.url}: {len(keywords)} keywords, "
                f"{len(relationships)} relationships. "
                f"Content reduced from {len(raw_content)} to {len(cleaned_content)} chars"
            )
            
        except Exception as e:
            self.logger.error(f"Content processing failed: {str(e)}", exc_info=True)
            raise ComponentError(f"Failed to process content: {str(e)}") from e

    async def _extract_keywords(self, content: str) -> List[List[RawKeyword]]:
        """Extract keywords using all available extractors.
        
        Args:
            content: Text to extract keywords from
            
        Returns:
            List of keyword lists, one from each extractor
            
        Raises:
            ComponentError: If extraction fails
        """
        results = []
        
        # Create tasks for each extractor
        async def run_extractor(extractor: BaseExtractor) -> Optional[List[RawKeyword]]:
            try:
                # Note: extract() is synchronous, but we run it in a task
                return extractor.extract(content)
            except Exception as e:
                self.logger.error(
                    f"Extractor {extractor.__class__.__name__} failed: {e}",
                    exc_info=True
                )
                return None

        # Create and gather all extraction tasks
        extraction_tasks = [
            run_extractor(extractor) for extractor in self.extractors
        ]
        extraction_results = await asyncio.gather(*extraction_tasks, return_exceptions=False)
        
        # Filter out None results from failed extractors
        results = [r for r in extraction_results if r is not None]
        
        # Log results
        for extractor, result in zip(self.extractors, extraction_results):
            if result:
                self.logger.debug(
                    f"Extractor {extractor.__class__.__name__} found "
                    f"{len(result)} keywords"
                )
                
        if not any(results):
            self.logger.warning("No keywords found by any extractor")
            
        return results