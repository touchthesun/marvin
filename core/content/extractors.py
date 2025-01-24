from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List
from collections import defaultdict
import uuid
import spacy
from core.utils.logger import get_logger
from .types import (
    KeywordType, ProcessingError, RawKeyword
)
from .keyword_identification import KeywordNormalizer


@dataclass
class ExtractorConfig:
    """Configuration for keyword extractors.
    
    Attributes:
        min_chars: Minimum characters for valid keywords
        max_words: Maximum words in a keyword phrase
        min_frequency: Minimum frequency to include keyword
        score_threshold: Minimum score to include keyword
    """
    min_chars: int = 3
    max_words: int = 4
    min_frequency: int = 1
    score_threshold: float = 0.5
    min_score: float = 0.1  # Minimum score to include a keyword
    max_keywords: int = 500  # Maximum number of keywords to extract
    debug: bool = False  # Enable additional logging

    def __post_init__(self):
        """Validate configuration parameters"""
        if self.min_chars < 1:
            raise ValueError("min_chars must be positive")
        if self.max_words < 1:
            raise ValueError("max_words must be positive")
        if self.min_frequency < 1:
            raise ValueError("min_frequency must be positive")
        if not 0 <= self.score_threshold <= 1:
            raise ValueError("score_threshold must be between 0 and 1")


@dataclass
class ProcessingConfig:
    """Configuration for keyword processing"""
    dedup_threshold: float = 0.85  # Similarity threshold for deduplication
    min_relationship_confidence: float = 0.5
    boost_factors: Dict[KeywordType, float] = field(default_factory=lambda: {
        KeywordType.CONCEPT: 1.2,
        KeywordType.TERM: 1.0
    })


class BaseExtractor(ABC):
    """Abstract base class for keyword extractors.
    
    This class defines the interface that all keyword extractors must implement.
    It provides basic logging and error handling infrastructure.
    """
    
    def __init__(self, 
                 config: ExtractorConfig,
                 normalizer: KeywordNormalizer):
        """Initialize the extractor.
        
        Args:
            config: Extractor configuration
            normalizer: Text normalization service
        """
        self.config = config
        self.normalizer = normalizer
        self.logger = get_logger(f"{__name__}.{self.__class__.__name__}")
        
    @abstractmethod
    def _extract_implementation(self, text: str) -> List[RawKeyword]:
        """Implementation of the extraction logic.
        
        Args:
            text: Text to extract keywords from
            
        Returns:
            List of extracted RawKeyword instances
            
        Raises:
            ProcessingError: If extraction fails
        """
        pass
        
    def extract(self, text: str) -> List[RawKeyword]:
        """Extract keywords from text.
        
        This method handles logging and error management around
        the concrete implementation.
        
        Args:
            text: Text to extract keywords from
            
        Returns:
            List of RawKeyword instances
            
        Raises:
            ProcessingError: If extraction fails
        """
        process_id = str(uuid.uuid4())
        self.logger.info(f"Starting extraction process {process_id}")
        
        try:
            if not text or len(text.strip()) < self.config.min_chars:
                self.logger.warning(f"Text too short for extraction: {len(text)} chars")
                return []
                
            results = self._extract_implementation(text)
            
            # Filter results based on configuration
            filtered_results = [
                kw for kw in results
                if (kw.frequency >= self.config.min_frequency and
                    kw.score >= self.config.score_threshold)
            ]
            
            self.logger.info(
                f"Extraction {process_id} complete: {len(filtered_results)} keywords "
                f"(filtered from {len(results)})"
            )
            
            return filtered_results
            
        except Exception as e:
            self.logger.error(
                f"Extraction {process_id} failed: {str(e)}", 
                exc_info=True
            )
            raise ProcessingError(f"Extraction failed: {str(e)}") from e


class RakeExtractor(BaseExtractor):
    """RAKE (Rapid Automatic Keyword Extraction) implementation.
    
    Extracts keywords using the RAKE algorithm, which considers
    word co-occurrence patterns and word frequency.
    """
    
    def __init__(self, config: ExtractorConfig, normalizer: KeywordNormalizer):
        super().__init__(config, normalizer)
        # Common English stop words - we should probably move this to a config file
        self.stop_words = {'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for',
                          'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
                          'that', 'the', 'to', 'was', 'were', 'will', 'with'}
        self.punctuation = set('.,;:!?()[]{}\'\"')
        
    def _extract_implementation(self, text: str) -> List[RawKeyword]:
        try:
            # Normalize text
            normalized_text = self.normalizer.normalize(text)
            
            # Split into phrases using stop words and punctuation
            phrases = self._split_into_phrases(normalized_text)
            
            # Calculate word scores
            word_scores = self._calculate_word_scores(phrases)
            
            # Track phrase frequencies
            phrase_freq = {}
            for phrase in phrases:
                if phrase in phrase_freq:
                    phrase_freq[phrase] += 1
                else:
                    phrase_freq[phrase] = 1
            
            # Generate phrase scores
            keywords = []
            for phrase, freq in phrase_freq.items():
                if not phrase or len(phrase.split()) > self.config.max_words:
                    continue
                    
                score = self._calculate_phrase_score(phrase, word_scores)
                if score > 0:
                    keywords.append(RawKeyword(
                        text=phrase,
                        score=score,
                        source='rake',
                        frequency=freq,
                        positions=[], 
                        metadata={
                            'method': 'rake',
                            'word_scores': {w: word_scores[w] for w in phrase.split()},
                            'raw_score': score * 10.0  # Pre-normalized score
                        }
                    ))
            
            return sorted(keywords, key=lambda x: x.score, reverse=True)
            
        except Exception as e:
            self.logger.error(f"RAKE extraction failed: {e}")
            raise ProcessingError(f"RAKE extraction failed: {str(e)}")
    
    def _split_into_phrases(self, text: str) -> List[str]:
        """Split text into phrases at stop words and punctuation."""
        # Replace punctuation with spaces
        for punct in self.punctuation:
            text = text.replace(punct, ' ')
        
        # Split into words
        words = text.split()
        phrases = []
        current_phrase = []
        
        for word in words:
            word = word.lower().strip()
            if word in self.stop_words:
                if current_phrase:
                    phrases.append(' '.join(current_phrase))
                    current_phrase = []
            else:
                current_phrase.append(word)
        
        # Add final phrase
        if current_phrase:
            phrases.append(' '.join(current_phrase))
            
        return [p for p in phrases if len(p) >= self.config.min_chars]
        
    def _calculate_word_scores(self, phrases: List[str]) -> Dict[str, float]:
        """Calculate scores for individual words based on co-occurrence."""
        # Track word frequency and degree (co-occurrences)
        word_freq = {}
        word_degree = {}
        
        for phrase in phrases:
            words = phrase.split()
            degree = len(words) - 1
            
            # Update frequency and degree for each word
            for word in words:
                word_freq[word] = word_freq.get(word, 0) + 1
                word_degree[word] = word_degree.get(word, 0) + degree
        
        # Calculate scores as degree/frequency
        word_scores = {}
        for word in word_freq:
            word_scores[word] = word_degree[word] / word_freq[word]
            
        return word_scores
        
    def _calculate_phrase_score(self, 
                              phrase: str,
                              word_scores: Dict[str, float]) -> float:
        """Calculate score for a complete phrase."""
        words = phrase.split()
        if not words:
            return 0.0
            
        # Score is the sum of word scores normalized by phrase length
        score = sum(word_scores.get(word, 0.0) for word in words) / len(words)
        
        # Normalize to 0-1 range - this might need tuning
        return min(1.0, score / 10.0)




class TfidfExtractor(BaseExtractor):
    def __init__(self, config: ExtractorConfig, normalizer: KeywordNormalizer):
        super().__init__(config, normalizer)
        
    def _calculate_term_importance(self, term: str, frequency: int, total_terms: int) -> float:
        """Calculate importance score for a term based on frequency and length.
        
        Args:
            term: The term to score
            frequency: Number of times the term appears
            total_terms: Total number of terms in document
            
        Returns:
            Float score between 0 and 1
        """
        if not term or frequency < 0 or total_terms < 1:
            return 0.0
        
        # Calculate normalized term frequency (0 to 1 range)
        tf = frequency / total_terms
        
        # Term length component - favor multi-word terms but don't over-penalize single words
        term_length = len(term.split())
        length_factor = 0.5 + (min(1.0, term_length / 3) * 0.5)  # Ranges from 0.5 to 1.0
        
        # Base score calculation
        score = tf * length_factor
        scaled_score = min(1.0, score * 100.0)
        
        self.logger.debug(f"Term score calculation for '{term}': tf={tf:.4f}, "
                        f"length_factor={length_factor:.2f}, final_score={scaled_score:.4f}")
        
        return scaled_score


    
    def _is_meaningful_keyword(self, term: str) -> bool:
            """
            Determine if a keyword is meaningful.
            
            Args:
                term: Keyword text to evaluate
            
            Returns:
                Boolean indicating if the keyword is meaningful
            """
            # Ignore single, very common words
            common_words = {
                'things', 'concept', 'concepts', 'new', 'way', 'big', 'small', 
                'more', 'less', 'good', 'great', 'part', 'many', 'some'
            }
            
            # Allow multi-word phrases containing meaningful terms
            if len(term.split()) > 1:
                return True
            
            # Ignore single, generic terms
            if term.lower() in common_words:
                return False
            
            # Allow terms with more specific meaning
            return len(term) > 2  # Ensure term has some substance

    

    def _extract_implementation(self, text: str) -> List[RawKeyword]:
        try:
            self.logger.info(f"Extraction: Text length {len(text)}")
            
            # Normalize text
            normalized_text = self.normalizer.normalize(text)
            self.logger.info(f"Normalized text length: {len(normalized_text)}")
            
            # Calculate term frequencies
            term_freqs = self._calculate_term_frequencies(normalized_text)
            total_terms = sum(term_freqs.values())
            self.logger.info(f"Total unique terms found: {len(term_freqs)}")
            
            # Track filtering reasons
            filtered_terms = {}
            filtered_counts = defaultdict(int)

            # Generate keywords
            keywords = []
            for term, freq in term_freqs.items():
                # Check word length constraints
                if len(term.split()) > self.config.max_words:
                    filtered_terms[term] = "Exceeds max words"
                    continue
                
                # Calculate importance score
                score = self._calculate_term_importance(term, freq, total_terms)
                
                # Apply filters
                if score <= self.config.min_score:
                    filtered_terms[term] = f"Low score: {score}"
                    filtered_counts['low_score'] += 1
                    continue
                
                if not self._is_meaningful_keyword(term):
                    filtered_terms[term] = "Not meaningful"
                    continue
                
                # Create keyword
                keywords.append(RawKeyword(
                    text=term,
                    score=score,
                    source='term_importance',
                    frequency=freq,
                    positions=[],
                    metadata={
                        'method': 'term_importance',
                        'term_frequency': freq,
                        'raw_score': score * 10.0
                    }
                ))
            
            # Log filtering statistics
            self.logger.info(f"Total keywords before filtering: {len(term_freqs)}")
            self.logger.info(f"Total keywords after filtering: {len(keywords)}")
            self.logger.info("Filtering breakdown:")
            for reason, count in filtered_counts.items():
                self.logger.info(f"  {reason}: {count}")
            
            return sorted(keywords, key=lambda x: x.score, reverse=True)
            
        except Exception as e:
            self.logger.error(f"Extraction failed", exc_info=True)
            return []
    
    def _calculate_term_frequencies(self, text: str) -> Dict[str, int]:
        """Calculate frequency of each term in the text."""
        terms = {}
        words = text.split()
        
        # First pass: collect individual words
        for word in words:
            if word not in terms:
                terms[word] = 1
            else:
                terms[word] += 1
        
        # Second pass: collect phrases up to max_words length
        for i in range(len(words)):
            for j in range(2, self.config.max_words + 1):
                if i + j <= len(words):
                    phrase = ' '.join(words[i:i+j])
                    if phrase not in terms:
                        terms[phrase] = 1
                    else:
                        terms[phrase] += 1
        
        return terms


class NamedEntityExtractor(BaseExtractor):
    """Named Entity Recognition based keyword extraction using spaCy.
    
    Extracts named entities as keywords using spaCy's NER system,
    converting them into our unified keyword model.
    """
    
    def __init__(self, 
                 config: ExtractorConfig,
                 normalizer: KeywordNormalizer,
                 nlp: 'spacy.language.Language'):
        """Initialize the extractor.
        
        Args:
            config: Extractor configuration
            normalizer: Text normalization service
            nlp: Initialized spaCy language model
        """
        super().__init__(config, normalizer)
        self.nlp = nlp
        
    def _extract_implementation(self, text: str) -> List[RawKeyword]:
        try:
            # Process text with spaCy
            doc = self.nlp(text)
            
            # Track entity frequencies
            entity_freq = {}
            entity_positions = {}
            
            # Extract entities and track frequencies
            for ent in doc.ents:
                # Skip entities that are too long
                if len(ent.text.split()) > self.config.max_words:
                    continue
                    
                # Use normalized text as key
                norm_text = self.normalizer.normalize(ent.text)
                
                if norm_text not in entity_freq:
                    entity_freq[norm_text] = 1
                    entity_positions[norm_text] = [(ent.start_char, ent.end_char)]
                else:
                    entity_freq[norm_text] += 1
                    entity_positions[norm_text].append((ent.start_char, ent.end_char))
            
            # Convert to keywords
            keywords = []
            for text, freq in entity_freq.items():
                # Calculate confidence score based on frequency
                base_score = min(1.0, 0.5 + (freq * 0.1))
                
                keywords.append(RawKeyword(
                    text=text,
                    score=base_score,
                    source='spacy_ner',
                    frequency=freq,
                    positions=entity_positions[text],
                    metadata={
                        'method': 'spacy_ner',
                        'original_text': text,
                    }
                ))
            
            return sorted(keywords, key=lambda x: x.score, reverse=True)
            
        except Exception as e:
            self.logger.error(f"Named Entity extraction failed: {e}")
            raise ProcessingError(f"Named Entity extraction failed: {str(e)}")