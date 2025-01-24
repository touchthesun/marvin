from typing import List, Dict
from dataclasses import dataclass, field
import math
import nltk
from collections import defaultdict
from ..core.tools.content.types import (
    RawKeyword, ProcessedKeyword, KeywordRelationship,
    KeywordType, RelationType, ExtractionError
)
from core.utils.logger import get_logger


@dataclass
class ProcessorConfig:
    """Configuration for keyword processing pipeline.
    
    Attributes:
        min_merge_score: Minimum score for merging results
        max_similar_distance: Maximum Levenshtein distance for similar terms
        min_relationship_confidence: Minimum confidence for relationships
        enable_stemming: Whether to use stemming in similarity checks
    """
    min_merge_score: float = 0.3
    max_similar_distance: int = 2
    min_relationship_confidence: float = 0.5
    enable_stemming: bool = True

    def __post_init__(self):
        """Validate configuration parameters"""
        if not 0 <= self.min_merge_score <= 1:
            raise ValueError("min_merge_score must be between 0 and 1")
        if self.max_similar_distance < 0:
            raise ValueError("max_similar_distance must be non-negative")
        if not 0 <= self.min_relationship_confidence <= 1:
            raise ValueError("min_relationship_confidence must be between 0 and 1")


class KeywordProcessor:
    """Handles merging and normalization of keywords from multiple extractors.
    
    This class is responsible for:
    - Merging results from different extractors
    - Normalizing scores across different methods
    - Detecting and handling similar keywords
    - Basic relationship inference
    """
    
    def __init__(self, config: ProcessorConfig):
        self.config = config
        self.logger = get_logger(__name__)
        self.stemmer = nltk.PorterStemmer() if config.enable_stemming else None
        
    def merge_results(self, 
                     raw_results: List[List[RawKeyword]]
                     ) -> List[ProcessedKeyword]:
        """Merge and normalize results from multiple extractors.
        
        Args:
            raw_results: List of results from different extractors
            
        Returns:
            List of merged and normalized ProcessedKeyword instances
        """
        try:
            # First, group by normalized text
            grouped = self._group_by_normalized_text(raw_results)
            
            # Merge and normalize scores
            merged = []
            for norm_text, keywords in grouped.items():
                if len(keywords) == 1:
                    # Single source, simple conversion
                    kw = keywords[0]
                    merged.append(ProcessedKeyword(
                        text=kw.text,
                        normalized_score=kw.score,
                        frequency=kw.frequency,
                        keyword_type=self._infer_type(kw),
                        sources=[kw.source],
                        metadata=kw.metadata
                    ))
                else:
                    # Multiple sources, need to merge
                    merged.append(self._merge_keyword_group(norm_text, keywords))
            
            # Sort by normalized score
            merged.sort(key=lambda x: x.normalized_score, reverse=True)
            
            self.logger.info(f"Merged {sum(len(r) for r in raw_results)} raw keywords "
                           f"into {len(merged)} processed keywords")
            
            return merged
            
        except Exception as e:
            self.logger.error(f"Error merging results: {e}", exc_info=True)
            raise ExtractionError(f"Failed to merge results: {str(e)}")
    
    def _group_by_normalized_text(self, 
                                raw_results: List[List[RawKeyword]]
                                ) -> Dict[str, List[RawKeyword]]:
        """Group keywords by their normalized text representation."""
        grouped = defaultdict(list)
        
        for result_set in raw_results:
            for keyword in result_set:
                norm_text = self._normalize_text(keyword.text)
                grouped[norm_text].append(keyword)
                
        return grouped
    
    def _normalize_text(self, text: str) -> str:
        """Create normalized version of text for comparison."""
        text = text.lower().strip()
        if self.stemmer:
            words = text.split()
            text = " ".join(self.stemmer.stem(word) for word in words)
        return text
    

    def _merge_keyword_group(self, 
                            norm_text: str,
                            keywords: List[RawKeyword]
                            ) -> ProcessedKeyword:
        """Merge a group of keywords into a single ProcessedKeyword.
        
        Args:
            norm_text: The normalized form that grouped these keywords
            keywords: List of keywords to merge
            
        Returns:
            ProcessedKeyword with combined information from all inputs
        """
        # Track both frequency and quality of each text form
        text_variants = defaultdict(lambda: {"frequency": 0, "score": 0.0})
        
        for kw in keywords:
            variant = text_variants[kw.text]
            variant["frequency"] += kw.frequency
            # Prefer forms that match source capitalization
            variant["score"] += kw.score * (1.2 if any(c.isupper() for c in kw.text) else 1.0)
        
        # Choose best text form considering both frequency and score
        original_text = max(
            text_variants.items(),
            key=lambda x: x[1]["frequency"] * x[1]["score"]
        )[0]
        
        # Combine scores with diminishing returns
        total_score = 0
        total_freq = 0
        sources = set()
        all_metadata = defaultdict(list)
        
        for kw in keywords:
            # Score contribution diminishes with each additional source
            score_contribution = kw.score / math.sqrt(1 + len(sources))
            total_score += score_contribution
            total_freq += kw.frequency
            sources.add(kw.source)
            
            # Collect metadata
            for key, value in kw.metadata.items():
                all_metadata[key].append(value)
        
        # Normalize final score to 0-1 range
        normalized_score = min(1.0, total_score / len(keywords))
        
        # Determine most likely type
        keyword_type = self._infer_type(max(keywords, key=lambda k: k.score))
        
        # Include normalized form in metadata
        all_metadata["normalized_form"] = [norm_text]
        
        # Include text variants in metadata
        all_metadata["text_variants"] = [{
            "text": text,
            "frequency": stats["frequency"],
            "score": stats["score"]
        } for text, stats in text_variants.items()]
        
        return ProcessedKeyword(
            text=original_text,
            normalized_score=normalized_score,
            frequency=total_freq,
            keyword_type=keyword_type,
            sources=list(sources),
            metadata=dict(all_metadata)
        )
    

    def _infer_type(self, keyword: RawKeyword) -> KeywordType:
        """Infer keyword type based on metadata and characteristics."""
        if 'entity_type' in keyword.metadata:
            return KeywordType.ENTITY
        
        text = keyword.text
        if len(text.split()) > 1:
            return KeywordType.CONCEPT
        
        return KeywordType.TERM


class RelationshipProcessor:
    """Handles detection and processing of relationships between keywords.
    
    This class is responsible for:
    - Detecting relationships between keywords
    - Calculating relationship confidence scores
    - Filtering and pruning relationships
    - Maintaining relationship consistency
    """
    
    def __init__(self, config: ProcessorConfig):
        self.config = config
        self.logger = get_logger(__name__)
    
    def process_relationships(self,
                            keywords: List[ProcessedKeyword]
                            ) -> List[ProcessedKeyword]:
        """Process and add relationships between keywords.
        
        Args:
            keywords: List of ProcessedKeyword instances
            
        Returns:
            Updated list of ProcessedKeyword instances with relationships
        """
        try:
            # Build lookup for efficient processing
            keyword_lookup = {kw.text: kw for kw in keywords}
            
            # Process each keyword
            for keyword in keywords:
                # Find containment relationships
                self._find_containment_relationships(
                    keyword, keyword_lookup
                )
                
                # Find similar terms
                self._find_similar_terms(
                    keyword, keyword_lookup
                )
                
                # Process entity-specific relationships
                if keyword.keyword_type == KeywordType.ENTITY:
                    self._process_entity_relationships(
                        keyword, keyword_lookup
                    )
            
            # Prune low-confidence relationships
            self._prune_relationships(keywords)
            
            return keywords
            
        except Exception as e:
            self.logger.error(f"Error processing relationships: {e}", exc_info=True)
            raise ExtractionError(f"Failed to process relationships: {str(e)}")
    
    def _find_containment_relationships(self,
                                      keyword: ProcessedKeyword,
                                      lookup: Dict[str, ProcessedKeyword]):
        """Find keywords that contain or are contained by this keyword."""
        text = keyword.text.lower()
        
        for other_text, other_kw in lookup.items():
            if other_text == keyword.text:
                continue
                
            other_text_lower = other_text.lower()
            
            # Check containment in both directions
            if text in other_text_lower:
                self._add_relationship(
                    keyword, other_kw,
                    RelationType.CONTAINS,
                    confidence=0.8
                )
            elif other_text_lower in text:
                self._add_relationship(
                    other_kw, keyword,
                    RelationType.CONTAINS,
                    confidence=0.8
                )
    
    def _find_similar_terms(self,
                           keyword: ProcessedKeyword,
                           lookup: Dict[str, ProcessedKeyword]):
        """Find keywords that are similar to this one."""
        text = keyword.text.lower()
        
        for other_text, other_kw in lookup.items():
            if other_text == keyword.text:
                continue
                
            # Check Levenshtein distance for similarity
            distance = nltk.edit_distance(text, other_text.lower())
            if distance <= self.config.max_similar_distance:
                confidence = 1.0 - (distance / self.config.max_similar_distance)
                
                if confidence >= self.config.min_relationship_confidence:
                    self._add_relationship(
                        keyword, other_kw,
                        RelationType.SYNONYM,
                        confidence=confidence
                    )
    
    def _process_entity_relationships(self,
                                    keyword: ProcessedKeyword,
                                    lookup: Dict[str, ProcessedKeyword]):
        """Process relationships specific to entity keywords."""
        if 'related_entities' in keyword.metadata:
            for related in keyword.metadata['related_entities']:
                if related in lookup:
                    self._add_relationship(
                        keyword, lookup[related],
                        RelationType.ENTITY,
                        confidence=0.9
                    )
    
    def _add_relationship(self,
                         source: ProcessedKeyword,
                         target: ProcessedKeyword,
                         rel_type: RelationType,
                         confidence: float):
        """Add a relationship between keywords."""
        relationship = KeywordRelationship(
            source=source.text,
            target=target.text,
            relationship_type=rel_type,
            confidence=confidence
        )
        
        # Add to source keyword's relationships
        source.relationships.append(relationship)
    
    def _prune_relationships(self, keywords: List[ProcessedKeyword]):
        """Remove low-confidence and redundant relationships."""
        for keyword in keywords:
            # Filter by confidence threshold
            keyword.relationships = [
                rel for rel in keyword.relationships
                if rel.confidence >= self.config.min_relationship_confidence
            ]
            
            # Remove duplicates (keep highest confidence)
            seen = {}
            unique_relationships = []
            
            for rel in sorted(keyword.relationships,
                            key=lambda x: x.confidence,
                            reverse=True):
                key = (rel.target, rel.relationship_type)
                if key not in seen:
                    seen[key] = True
                    unique_relationships.append(rel)
            
            keyword.relationships = unique_relationships


class PipelineOrchestrator:
    """Coordinates the keyword processing pipeline.
    
    This class orchestrates the complete keyword processing pipeline,
    from raw extraction results to fully processed keywords with relationships.
    """
    
    def __init__(self,
                 processor: KeywordProcessor,
                 relationship_processor: RelationshipProcessor):
        self.processor = processor
        self.relationship_processor = relationship_processor
        self.logger = get_logger(__name__)
    
    def process(self,
                raw_results: List[List[RawKeyword]]
                ) -> List[ProcessedKeyword]:
        """Process raw extraction results through the complete pipeline.
        
        Args:
            raw_results: List of raw results from different extractors
            
        Returns:
            List of fully processed keywords with relationships
        """
        try:
            # Merge and normalize results
            processed = self.processor.merge_results(raw_results)
            
            # Process relationships
            final_results = self.relationship_processor.process_relationships(
                processed
            )
            
            self.logger.info(
                f"Pipeline complete: {len(final_results)} keywords with "
                f"relationships processed"
            )
            
            return final_results
            
        except Exception as e:
            self.logger.error(f"Pipeline processing failed: {e}", exc_info=True)
            raise ExtractionError(f"Pipeline failed: {str(e)}")