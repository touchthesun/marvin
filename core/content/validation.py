from dataclasses import dataclass, field
from typing import Set
import re
from abc import ABC, abstractmethod
import spacy
from core.utils.logger import get_logger
from .keyword_identification import KeywordIdentifier
from .abbreviations import AbbreviationService
from .types import ProcessingError

logger = get_logger(__name__)

@dataclass
class ValidationConfig:
    """Configuration for keyword validation.
    
    Attributes:
        max_words: Maximum words in a keyword
        forbidden_starts: Words that cannot start a keyword
        min_word_length: Minimum length for non-abbreviation words
        allow_numbers: Whether to allow numbers in keywords
    """
    max_words: int = 4
    forbidden_starts: Set[str] = field(default_factory=lambda: {
        'following', 'one', 'otherwise', 'using', 
        'contains', 'gets'
    })
    min_word_length: int = 3
    allow_numbers: bool = False


class ValidationRule(ABC):
    """Abstract base class for validation rules.
    
    All validation rules must:
    1. Accept a KeywordIdentifier in their is_valid method
    2. Handle variants appropriately
    3. Document specific validation criteria
    """
    
    def __init__(self, nlp: 'spacy.language.Language'):
        """Initialize with spaCy model."""
        self.nlp = nlp
    
    @abstractmethod
    def is_valid(self, keyword: KeywordIdentifier) -> bool:
        """Validate if a keyword meets the rule's criteria."""
        pass


class BasicTextRule(ValidationRule):
    """Validates basic text characteristics."""
    
    def __init__(self, 
                 nlp: 'spacy.language.Language',
                 config: ValidationConfig,
                 abbreviation_service: AbbreviationService):
        super().__init__(nlp)
        self.config = config
        self.abbreviation_service = abbreviation_service
        
        # Compile patterns for invalid characters
        self.invalid_chars = re.compile(r'[^\w\s-]' if config.allow_numbers else r'[^a-zA-Z\s-]')
    
    def is_valid(self, keyword: KeywordIdentifier) -> bool:
        """Check basic text validity."""
        # Check all variants
        for text in keyword.variants:
            # Skip abbreviation checks for known abbreviations
            if self.abbreviation_service.is_abbreviation(text):
                continue
            
            # Check for invalid characters
            if self.invalid_chars.search(text):
                return False
            
            # Check word count
            words = text.split()
            if len(words) > self.config.max_words:
                return False
            
            # Check word lengths
            if any(len(word) < self.config.min_word_length 
                   for word in words):
                return False
            
            # Check forbidden starts
            if words[0].lower() in self.config.forbidden_starts:
                return False
        
        return True

class SemanticFilterRule(ValidationRule):
    """Filters keywords based on semantic patterns."""
    
    def __init__(self, nlp: 'spacy.language.Language'):
        super().__init__(nlp)
        
        # Temporal patterns remain the same
        self.temporal_patterns = [
            r'\b\d+\s*(second|minute|hour|day|week|month|year)s?\b',
            r'\b(few|several|many|last|next|recent)\s*(second|minute|hour|day|week|month|year)s?\b',
            r'\b(today|tomorrow|yesterday)\b',
            r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\b',
            r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',
            r'\b(morning|afternoon|evening|night)\b',
            r'\b\d+\s*(am|pm)\b',
            r'\b\d+\s*years?\s*old\b',
            r'\b(past|future|current)\s+(week|month|year|quarter)\b'
        ]
        
        # Quantity patterns remain the same
        self.quantity_patterns = [
            r'\b(hundred|thousand|million|billion|trillion)s?\b',
            r'\b(dozen|several|many|numerous|multiple)\b',
            r'\b\d+\s*(dollar|pound|euro|kg|lb|mile|km)\b',
            r'\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b',
            r'\b(one|two|three|four|five|six|seven|eight|nine|ten)\b'
        ]
        
        # Generic terms that should only be filtered when standalone
        self.generic_terms = {
            'information', 'data', 'content', 'thing', 'stuff',
            'corp', 'inc', 'ltd', 'company', 'organization',
            'today', 'time', 'day', 'week', 'month', 'year',
            'group', 'team', 'unit', 'division',
            'cap', 'initiative', 'platform', 'service',
            'system', 'process', 'method', 'way',
            'part', 'piece', 'section', 'area'
        }

        # Compile patterns
        self.compiled_patterns = [
            (re.compile(pattern, re.IGNORECASE), category)
            for pattern, category in (
                [(p, 'temporal') for p in self.temporal_patterns] +
                [(p, 'quantity') for p in self.quantity_patterns]
            )
        ]

    def _is_meaningful_compound(self, doc: 'spacy.tokens.Doc') -> bool:
        """Check if a multi-word term forms a meaningful compound."""
        
        # Check if it's a named entity
        if doc.ents:
            return True
            
        # Look for noun chunks (base noun phrases)
        if list(doc.noun_chunks):
            return True
            
        # Check for compound dependencies
        if any(token.dep_ == 'compound' for token in doc):
            return True
            
        # Check POS patterns that suggest meaningful compounds
        pos_sequence = [token.pos_ for token in doc]
        meaningful_patterns = [
            ['ADJ', 'NOUN'],           # e.g., "digital transformation"
            ['NOUN', 'NOUN'],          # e.g., "information security"
            ['PROPN', 'NOUN'],         # e.g., "Python library"
            ['ADJ', 'ADJ', 'NOUN'],    # e.g., "open source software"
            ['NOUN', 'NOUN', 'NOUN'],  # e.g., "data science platform"
            ['ADJ', 'NOUN', 'NOUN']    # e.g., "digital asset management"
        ]
        return pos_sequence in meaningful_patterns

    def is_valid(self, keyword: KeywordIdentifier) -> bool:
        """Check if keyword should be included based on semantic rules."""
        # Check all variants
        for variant in keyword.variants:
            text = variant.lower()
            words = text.split()
            
            # Process with spaCy
            doc = self.nlp(text)
            
            # If it's a single word
            if len(words) == 1:
                # Filter out standalone generic terms
                if text in self.generic_terms:
                    return False
                    
            # If it's a compound term containing generic words
            else:
                if any(word in self.generic_terms for word in words):
                    # Only keep it if it forms a meaningful compound
                    if not self._is_meaningful_compound(doc):
                        return False
            
            # Check temporal/quantity patterns
            for pattern, category in self.compiled_patterns:
                if pattern.search(text):
                    return False
            
            # Filter out certain entity types
            if doc.ents:
                for ent in doc.ents:
                    if ent.label_ in {'DATE', 'TIME', 'CARDINAL', 'ORDINAL', 'QUANTITY', 'PERCENT'}:
                        return False
            
        return True

class CodePatternRule(ValidationRule):
    def __init__(self, 
                    nlp: 'spacy.language.Language',
                    abbreviation_service: AbbreviationService):
            super().__init__(nlp)
            self.abbreviation_service = abbreviation_service
            self.code_operators = set('()><=+-*/%')
            self.code_keywords = {
                'print', 'import', 'del', 'def', 'class', 'return',
                'if', 'else', 'for', 'while', 'try', 'except'
            }

            # Split patterns into case-sensitive and case-insensitive
            self.case_sensitive_patterns = [
                r'\b[A-Z][A-Z_]+[A-Z]\b',  # ALL_CAPS constants (must be at least 3 chars)
            ]
            self.case_insensitive_patterns = [
                r'\w+\.\w+\(',  # Method calls
                r'\w+\s*=\s*\w+',  # Assignments
                r'\b\d+\s*[+\-*/]\s*\d+\b',  # Math operations
                r'\b(true|false|null|undefined)\b',  # Programming literals
                r'\b(function|var|let|const)\b',  # Programming keywords
            ]
            
            # Compile patterns with appropriate flags
            self.compiled_patterns = (
                [re.compile(p) for p in self.case_sensitive_patterns] +
                [re.compile(p, re.I) for p in self.case_insensitive_patterns]
            )


    def is_valid(self, keyword: KeywordIdentifier) -> bool:
            """Check if keyword contains code-like patterns.
            
            Args:
                keyword: KeywordIdentifier to validate
                
            Returns:
                bool: True if no code patterns are found
            """
            # Process each variant
            for variant in keyword.variants:
                # Skip if it's a valid abbreviation
                if self.abbreviation_service.is_abbreviation(variant):
                    continue
                    
                # Create spaCy doc for linguistic analysis
                doc = self.nlp(variant)
                
                # Check for code keywords
                if any(token.text.lower() in self.code_keywords for token in doc):
                    return False

                # Check for Python REPL prompts
                if '>>>' in variant:
                    return False

                # Check for operators
                if any(operator in variant for operator in self.code_operators):
                    return False

                # Check for code patterns
                if any(p.search(variant) for p in self.compiled_patterns):
                    return False

            return True


class GrammaticalRule(ValidationRule):
    """Validates phrase grammatical structure.
    
    Requires spaCy Doc with tokenization, POS tagging, and dependency parsing.
    """
    def __init__(self, nlp: spacy.language.Language):
        super().__init__(nlp)
        self.valid_patterns = [
            ['NOUN'], ['PROPN'],
            ['ADJ', 'NOUN'], ['ADJ', 'PROPN'],
            ['NOUN', 'NOUN'], ['PROPN', 'NOUN'], ['NOUN', 'PROPN'],
            ['ADJ', 'ADJ', 'NOUN'],
            ['ADJ', 'NOUN', 'NOUN'],
            ['NOUN', 'NOUN', 'NOUN'],
            ['PROPN', 'PROPN'],  # Compound proper nouns
            ['NUM', 'NOUN'],  # Numbered items
            ['NOUN', 'VERB'],  # For gerund constructions
            ['ADJ', 'VERB'],   # For gerund constructions
            ['PROPN', 'PROPN', 'PROPN'],
            ['PROPN', 'PROPN', 'PROPN', 'PROPN']
        ]

    def is_valid(self, keyword: KeywordIdentifier) -> bool:
        """Check if phrase has valid grammatical structure.
        
        Args:
            phrase: Text to check
            doc: spaCy Doc with POS tags and dependency parse
            
        Returns:
            bool: True if phrase has valid grammar structure
        """

        # Process canonical form
        doc = self.nlp(keyword.canonical_text)

        # Get POS sequence
        pos_sequence = [token.pos_ for token in doc]

        # Must have at least one noun or gerund
        if not any(pos in {'NOUN', 'PROPN'} for pos in pos_sequence) and \
           not any(token.pos_ == 'VERB' and token.tag_ == 'VBG' for token in doc):
            return False

        # Handle gerunds by treating them as nouns
        pos_sequence = [
            'NOUN' if (pos == 'VERB' and token.tag_ == 'VBG') else pos
            for pos, token in zip(pos_sequence, doc)
        ]

        # Check against valid patterns
        if pos_sequence in self.valid_patterns:
            return True

        # Special case for compound terms
        if len(pos_sequence) <= 4:  # Limit length for compounds
            noun_positions = [i for i, pos in enumerate(pos_sequence) 
                            if pos in {'NOUN', 'PROPN'}]
            if noun_positions and len(noun_positions) >= 1:
                return True

        return False
    

@dataclass
class TextPatternConfig:
    """Configuration for text pattern validation."""
    max_words: int = 4
    min_word_length: int = 3
    forbidden_starts: Set[str] = field(default_factory=lambda: {
        'following', 'one', 'otherwise', 'using', 
        'contains', 'gets'
    })
    allow_numbers: bool = False


class TextPatternRule(ValidationRule):
    """Validates text patterns and structure.
    
    Requires spaCy Doc with tokenization, POS tagging, and dependency parsing.
    """
    def __init__(self, 
                 nlp: 'spacy.language.Language',
                 config: TextPatternConfig = None):
        super().__init__(nlp)
        self.config = config or TextPatternConfig()
        
        # Text-based patterns
        self.invalid_patterns = [
            r'[0-9\(\)\[\]\{\}]' if not self.config.allow_numbers else r'[\(\)\[\]\{\}]',  # Special characters
            r'^(how|what|when|where|why|who)\s',  # Question words
            r'(https?|ftp):\/\/',  # URLs
            r'[^a-zA-Z\s-]' if not self.config.allow_numbers else r'[^a-zA-Z0-9\s-]',  # Non-letter characters
        ]
        self.compiled_patterns = [re.compile(p) for p in self.invalid_patterns]
        
        # Linguistic patterns
        self.invalid_deps = {
            'prep',      # Prepositions
            'punct',     # Punctuation
            'det',       # Determiners
            'aux',       # Auxiliary verbs
            'mark',      # Markers
        }
        
        self.invalid_pos = {
            'INTJ',     # Interjections
            'PART',     # Particles
            'DET',      # Determiners
            'PUNCT',    # Punctuation
            'SYM',      # Symbols
            'X',        # Other
        }

    def is_valid(self, keyword: KeywordIdentifier) -> bool:
        """Check if keyword matches valid text patterns."""
        # Process each variant
        for variant in keyword.variants:
            # Create spaCy doc for linguistic analysis
            doc = self.nlp(variant)
            
            # Basic text checks from former BasicTextRule
            words = variant.split()
            if len(words) > self.config.max_words:
                return False
            
            if any(len(word) < self.config.min_word_length for word in words):
                return False
            
            if words[0].lower() in self.config.forbidden_starts:
                return False

            # Original TextPatternRule checks
            proper_noun_count = sum(1 for token in doc if token.pos_ == 'PROPN')
            if proper_noun_count >= 2:
                # Allow prepositions in proper noun phrases
                allowed_pos = {'PROPN', 'ADP'}
                if all(token.pos_ in allowed_pos for token in doc):
                    return True
            
            # Check regex patterns
            if any(p.search(variant.lower()) for p in self.compiled_patterns):
                return False
                
            # Check for invalid dependencies
            if any(token.dep_ in self.invalid_deps for token in doc):
                return False
                
            # Check for invalid POS
            if any(token.pos_ in self.invalid_pos for token in doc):
                return False
                
            # Check that we don't start with certain POS tags
            if doc[0].pos_ in {'ADP', 'CCONJ', 'SCONJ'}:
                return False
                
            # Check dependency structure
            if len(doc) > 1:
                root = [token for token in doc if token.dep_ == 'ROOT']
                if not root or root[0].pos_ not in {'NOUN', 'PROPN', 'ADJ'}:
                    return False

        return True


class KeywordValidator:
    """Main validator class that coordinates all validation rules"""
    def __init__(self,
                 nlp: 'spacy.language.Language',
                 config: ValidationConfig,
                 abbreviation_service: AbbreviationService):
        """Initialize validator with spaCy model and config."""
        self.config = config
        self.abbreviation_service = abbreviation_service
        self.logger = get_logger(__name__)

        # Create text pattern config from validation config
        text_pattern_config = TextPatternConfig(
            max_words=config.max_words,
            min_word_length=config.min_word_length,
            forbidden_starts=config.forbidden_starts,
            allow_numbers=config.allow_numbers
        )

        # Initialize validation rules with required dependencies
        self.rules = [
            CodePatternRule(nlp, abbreviation_service),
            GrammaticalRule(nlp),
            TextPatternRule(nlp, text_pattern_config),
            SemanticFilterRule(nlp)
        ]

        for rule in self.rules:
            logger.info(f"Loaded rule: {rule.__class__.__name__}")
            
    
    def is_valid(self, keyword: KeywordIdentifier) -> bool:
        """Validate a keyword against all rules.
        
        Args:
            keyword: Keyword to validate
            
        Returns:
            True if keyword passes all validation rules
        """
        try:
            # Apply each rule
            for rule in self.rules:
                if not rule.is_valid(keyword):
                    self.logger.debug(
                        f"Keyword '{keyword.canonical_text}' failed "
                        f"{rule.__class__.__name__}"
                    )
                    return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"Validation error: {e}", exc_info=True)
            raise ProcessingError(f"Validation failed: {str(e)}")



