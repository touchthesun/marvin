import re
import math
import nltk
import uuid
import spacy
import textwrap
from rake_nltk import Rake, Metric
from sklearn.feature_extraction.text import TfidfVectorizer
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field
from core.utils.logger import get_logger
from core.tools.content.context import get_content_context
from core.tools.content.entities import (
    RelationshipContext, EntityContext, EntityMention
    )
from core.tools.content.validation import (
    KeywordValidator, ValidationConfig
    )
from core.tools.content.text_processing import (
    TextCleaner, HTMLProcessor
    )



def initialize_nltk_resources():
    """Ensure all required NLTK resources are downloaded"""
    required_resources = [
        ('tokenizers/punkt', 'punkt'),
        ('tokenizers/punkt_tab/english', 'punkt_tab'),  # Added for RAKE-NLTK
        ('corpora/stopwords', 'stopwords'),
        ('taggers/averaged_perceptron_tagger', 'averaged_perceptron_tagger'),
        ('chunkers/maxent_ne_chunker', 'maxent_ne_chunker'),
        ('corpora/words', 'words')
    ]
    
    logger = get_logger(__name__)
    
    for resource_path, resource_name in required_resources:
        try:
            nltk.data.find(resource_path)
            logger.debug(f"Found NLTK resource: {resource_name}")
        except LookupError:
            logger.info(f"Downloading NLTK resource: {resource_name}")
            nltk.download(resource_name, quiet=True)
            logger.info(f"Successfully downloaded: {resource_name}")

# Initialize NLTK resources when module is loaded
initialize_nltk_resources()


@dataclass
class KeywordResult:
    """Stores keyword extraction results with metadata"""
    keyword: str
    score: float
    frequency: int
    length: int
    source: str  # Indicates which method found this keyword (rake/spacy/combined)
    keyword_type: str  # Entity type for named entities, 'phrase' for RAKE keywords
    related_terms: List[str] = field(default_factory=list)



class KeywordExtractionError(Exception):
    """Custom exception for keyword extraction errors"""
    pass

class KeywordExtractor:
    """Main keyword extraction engine supporting multiple extraction methods.
    
    Implements a hybrid keyword extraction system combining RAKE algorithm,
    TF-IDF analysis, and named entity recognition. Supports both single-method
    and hybrid extraction approaches with relationship tracking between keywords.
    
    The extractor handles both plain text and HTML input, with built-in
    cleaning and preprocessing. It uses spaCy for NLP tasks and implements
    custom scoring algorithms for keyword relevance.
    
    Attributes:
        text_cleaner (TextCleaner): Text preprocessing utility
        html_processor (HTMLProcessor): HTML content extractor
        min_chars (int): Minimum characters for valid keywords
        max_words (int): Maximum words in a keyword phrase
        nlp: spaCy language model for NLP tasks
        rake: RAKE algorithm instance
        tfidf: TF-IDF vectorizer instance
        logger: Logger instance for tracking extraction process
    
    Methods:
        extract_keywords: Basic keyword extraction using RAKE
        extract_keywords_hybrid: Advanced extraction using multiple methods
        is_valid_phrase: Validates potential keywords
        calculate_phrase_score: Computes keyword relevance scores
        
    Example:
        >>> extractor = KeywordExtractor()
        >>> keywords = extractor.extract_keywords_hybrid("The quick brown fox...")
        >>> print(keywords[0].keyword, keywords[0].score)
        'quick brown fox' 0.85
    """
    
    def __init__(self, 
                 nlp: spacy.language.Language,
                 text_cleaner: TextCleaner = None,
                 html_processor: HTMLProcessor = None,
                 min_chars: int = 3,
                 max_words: int = 4):
        
        try:
            self.logger = get_logger(__name__)
            self.nlp = nlp
            self.min_chars = min_chars
            self.max_words = max_words
            
            # Initialize helpers
            self.text_cleaner = text_cleaner or TextCleaner()
            self.html_processor = html_processor or HTMLProcessor(self.text_cleaner)
            self.content_context = get_content_context()
            
            # Initialize keyword validator
            self.validator = KeywordValidator(
                nlp=nlp,
                config=ValidationConfig(max_words=max_words)
            )
            
            # Initialize RAKE
            self.rake = Rake(
                min_length=min_chars,
                max_length=max_words,
                ranking_metric=Metric.DEGREE_TO_FREQUENCY_RATIO,
                stopwords=text_cleaner.stopwords,
                punctuations=text_cleaner.punctuation
            )

            # Initialize TF-IDF
            self.tfidf = TfidfVectorizer(
                ngram_range=(1, 3),
                stop_words=list(text_cleaner.stopwords),
                min_df=1,
                max_df=1.0,
                lowercase=True,
                sublinear_tf=True
            )

            self.entity_context = EntityContext()
            self.context_initialized = False
            
            self.logger.info("KeywordExtractor initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize KeywordExtractor: {e}")
            raise KeywordExtractionError(f"Initialization failed: {str(e)}")


    def reset_state(self):
        """Reset extractor state between documents"""
        self.entity_context = EntityContext()
        self.context_initialized = False

    def prepare_batch(self):
        """Prepare for batch processing"""
        # Initialize shared resources
        pass

    def cleanup_batch(self):
        """Cleanup after batch processing"""
        # Release resources
        pass

    def reset_context(self):
        """Reset entity context for new document processing"""
        self.entity_context = EntityContext()
        self.context_initialized = False
        self.logger.debug("Entity context reset")


    def _ensure_clean_state(self):
            """Ensure clean state before processing new document"""
            if hasattr(self, 'entity_context'):
                if self.context_initialized:
                    self.logger.debug("Resetting existing entity context")
                self.reset_state()
            else:
                self.entity_context = EntityContext()
                self.context_initialized = False

    def initialize_context(self):
        """Explicitly initialize entity context if needed"""
        if not self.context_initialized:
            self.entity_context = EntityContext()
            self.context_initialized = True
            self.logger.debug("Entity context initialized")

    def _ensure_context(self):
        """Ensure entity context is initialized"""
        if not hasattr(self, 'entity_context') or self.entity_context is None:
            self.logger.warning("Entity context not found, initializing new context")
            self.initialize_context()
        elif not self.context_initialized:
            self.logger.debug("Context exists but not initialized, marking as initialized")
            self.context_initialized = True

    def is_valid_phrase(self, phrase: str) -> bool:
            """Delegate phrase validation to the KeywordValidator"""
            return self.validator.is_valid_phrase(phrase)

    def _extract_rake_keywords(self, text: str) -> Dict[str, Tuple[float, int]]:
        try:
            if not text:
                raise ValueError("Input text cannot be empty")

            if len(text) > 50000:
                chunks = textwrap.wrap(text, 50000)
                all_keywords = {}
                
                for chunk in chunks:
                    chunk_keywords = self._process_text_chunk(chunk)
                    for phrase, (score, freq) in chunk_keywords.items():
                        if phrase in all_keywords:
                            existing_score, existing_freq = all_keywords[phrase]
                            all_keywords[phrase] = (max(score, existing_score), 
                                                  existing_freq + freq)
                        else:
                            all_keywords[phrase] = (score, freq)
                            
                return self._normalize_scores(all_keywords)
            
            return self._normalize_scores(self._process_text_chunk(text))
            
        except Exception as e:
            self.logger.error(f"Error in RAKE keyword extraction: {e}", exc_info=True)
            raise KeywordExtractionError(f"RAKE extraction failed: {str(e)}")

    def _process_text_chunk(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Process a single chunk of text with RAKE"""
        try:
            if not text:
                raise ValueError("Text chunk cannot be empty")
                
            self.rake.extract_keywords_from_text(text)
            phrases_scores = self.rake.get_ranked_phrases_with_scores()
            
            keywords = {}
            for score, phrase in phrases_scores:
                phrase = phrase.strip()
                
                if not self.validator.is_valid_phrase(phrase):
                    continue
                    
                freq = len(re.findall(r'\b' + re.escape(phrase.lower()) + r'\b',
                                    text.lower()))
                
                if freq > 0:
                    adjusted_score = self._calculate_rake_score(score, freq, phrase)
                    if adjusted_score > 0.5:
                        keywords[phrase] = (adjusted_score, freq)
            
            self.logger.debug(f"Processed chunk with {len(keywords)} valid keywords")
            return keywords
            
        except Exception as e:
            self.logger.error(f"Error processing text chunk: {e}", exc_info=True)
            raise KeywordExtractionError(f"Chunk processing failed: {str(e)}")

    def _calculate_rake_score(self, base_score: float, freq: int, phrase: str) -> float:
        """Calculate adjusted RAKE score for a phrase"""
        score = base_score * math.log(1 + freq)
        
        # Frequency adjustments
        if freq == 1:
            score *= 0.5
            
        # Length adjustments    
        words = phrase.split()
        if len(words) == 2:
            score *= 1.1
        elif len(words) > 3:
            score *= 0.8
            
        return score

    def _extract_tfidf_keywords(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Extract keywords using TF-IDF with validation"""
        try:
            if not text:
                raise ValueError("Input text cannot be empty")
                
            tfidf_matrix = self.tfidf.fit_transform([text])
            feature_names = self.tfidf.get_feature_names_out()
            
            keywords = {}
            scores = tfidf_matrix.toarray()[0]
            
            term_scores = [(feature_names[idx], score) 
                        for idx, score in enumerate(scores)]
            term_scores.sort(key=lambda x: x[1], reverse=True)
            
            for term, score in term_scores:
                if score > 0 and self.validator.is_valid_phrase(term):
                    freq = len(re.findall(r'\b' + re.escape(term) + r'\b', 
                                        text.lower()))
                    if freq > 0:
                        keywords[term] = (score, freq)
            
            self.logger.debug(f"Extracted {len(keywords)} TF-IDF keywords")
            return keywords
            
        except Exception as e:
            self.logger.error(f"Error in TF-IDF extraction: {e}", exc_info=True)
            raise KeywordExtractionError(f"TF-IDF extraction failed: {str(e)}")

    def _extract_named_entities(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Extract named entities using spaCy and track relationships"""
        try:
            # Reset context for new document
            self.reset_context()

            if not text or len(text.strip()) < self.min_chars:
                self.logger.debug(f"Text too short for entity extraction: {len(text)} chars")
                return {}
            
            doc = self.nlp(text)
            keywords = {}
            
            # Process each sentence to get sentence IDs
            for sent_id, sent in enumerate(doc.sents):
                # Find entities in this sentence
                for ent in sent.ents:
                    if ent.label_ in {'ORG', 'PERSON', 'PRODUCT', 'GPE', 'WORK_OF_ART'}:
                        entity_text = ent.text.strip()
                        if self.validator.is_valid_phrase(entity_text):
                            # Create entity mention
                            mention = EntityMention(
                                text=entity_text,
                                start=ent.start,
                                end=ent.end,
                                sentence_id=sent_id,
                                type=ent.label_,
                                score=1.1 if len(entity_text.split()) > 1 else 1.0
                            )
                            
                            # Register with content context
                            self.content_context.register_entity_mention(mention)
                            
                            # Also maintain keyword format for compatibility
                            freq = len(re.findall(r'\b' + re.escape(entity_text.lower()) + r'\b',
                                                text.lower()))
                            keywords[entity_text] = (mention.score, freq)
                
                # Process relationships between entities in this sentence
                sentence_entities = [ent for ent in sent.ents 
                                if ent.label_ in {'ORG', 'PERSON', 'PRODUCT', 'GPE', 'WORK_OF_ART'}]
                
                # Add relationship context for entities in same sentence
                for i, ent1 in enumerate(sentence_entities):
                    for ent2 in sentence_entities[i+1:]:
                        if self.validator.is_valid_phrase(ent1.text) and \
                        self.validator.is_valid_phrase(ent2.text):
                            context = RelationshipContext(
                                sentence_text=sent.text,
                                sentence_id=sent_id,
                                entity1_position=(ent1.start, ent1.end),
                                entity2_position=(ent2.start, ent2.end),
                                dependency_path=self._get_dependency_path(ent1, ent2)
                            )
                            self.entity_context.register_relationship(
                                ent1.text.strip(),
                                ent2.text.strip(),
                                context
                            )

            self.context_initialized = True
            self.logger.debug(f"Processed {len(keywords)} entities with relationships")
            return keywords

        except Exception as e:
            self.logger.error(f"Error processing entities: {e}", exc_info=True)
            raise KeywordExtractionError(f"Entity extraction failed: {str(e)}")

    def _get_dependency_path(self, ent1: spacy.tokens.Span, ent2: spacy.tokens.Span) -> Optional[str]:
        """Get the dependency path between two entities if it exists"""
        try:
            # Get the root tokens of each entity
            root1 = ent1.root
            root2 = ent2.root
            
            # Get the dependency path (simplified for now)
            return f"{root1.dep_}->{root2.dep_}"
        except Exception as e:
            self.logger.warning(f"Could not get dependency path: {e}")
            return None


    def _normalize_scores(self, keywords: Dict[str, Tuple[float, int]]) -> Dict[str, Tuple[float, int]]:
        """Normalize scores to a consistent range"""
        if not keywords:
            return keywords
        try:        
            scores = [score for score, _ in keywords.values()]
            min_score = min(scores)
            max_score = max(scores)
            
            score_range = max_score - min_score
            if score_range == 0:
                return keywords
            
            normalized = {}
            for phrase, (score, freq) in keywords.items():
                norm_score = 1 + 9 * ((score - min_score) / score_range)
                normalized[phrase] = (norm_score, freq)
            
            return normalized
        except:
            self.logger.error("Error normalizing scores, returning keywords")
            return keywords

    def _combine_keyword_scores(self, rake_kw: Dict, tfidf_kw: Dict, 
                            entity_kw: Dict, min_score: float = 0.1) -> Dict[str, Dict]:
        """Combine scores from different methods with relationship tracking"""
        self._ensure_context()
        combined = {}
        

        if self.context_initialized:
            relationships = self.entity_context.get_entity_relationships(min_confidence=0.5)
            self.logger.debug(f"Found {len(relationships)} relationships above confidence threshold")
            for source, target, confidence in relationships:
                if source in combined:
                    self.logger.debug(f"Adding relationship: {source} -> {target} (conf: {confidence:.2f})")
                    combined[source]['related_terms'].append(target)

            # Add entities first, using relationships from entity_context
            for keyword, (score, freq) in entity_kw.items():
                confidence = self._calculate_entity_confidence(keyword)
                combined[keyword] = {
                    'score': score * 1.2,  # Maintain entity score boost
                    'frequency': freq,
                    'type': 'entity',
                    'related_terms': []
                }
                    
            # Get relationships from entity context

            relationships = self.entity_context.get_entity_relationships(min_confidence=0.5)
            for source, target, confidence in relationships:
                if source in combined:
                    combined[source]['related_terms'].append(target)
                if target in combined:
                    combined[target]['related_terms'].append(source)
            
            # Add RAKE phrases, now considering entity context
            for phrase, (score, freq) in rake_kw.items():
                # Find any entities within this phrase
                related_entities = [
                    entity for entity in entity_kw.keys()
                    if entity.lower() in phrase.lower()
                ]
                
                combined[phrase] = {
                    'score': score,
                    'frequency': freq,
                    'type': 'concept',
                    'related_terms': related_entities
                }
                
                # Add bidirectional relationship
                for entity in related_entities:
                    if entity in combined:
                        if phrase not in combined[entity]['related_terms']:
                            combined[entity]['related_terms'].append(phrase)
            
            # Add TF-IDF terms
            for term, (score, freq) in tfidf_kw.items():
                if score > min_score and term not in combined:
                    # Find related items from existing entries
                    related_items = [
                        k for k in combined.keys()
                        if term.lower() in k.lower() or k.lower() in term.lower()
                    ]
                    
                    combined[term] = {
                        'score': score * 0.8,  # Maintain tf-idf score adjustment
                        'frequency': freq,
                        'type': 'term',
                        'related_terms': related_items
                    }
                    
                    # Add bidirectional relationship
                    for item in related_items:
                        if term not in combined[item]['related_terms']:
                            combined[item]['related_terms'].append(term)
        else:
            self.logger.warning("Entity context not initialized, skipping relationship processing")
            for keyword, (score, freq) in entity_kw.items():
                combined[keyword] = {
                    'score': score,
                    'frequency': freq,
                    'type': 'entity',
                    'related_terms': []
                }

        return combined


    def _filter_similar_keywords(self, keywords: List[KeywordResult]) -> List[KeywordResult]:
        """Remove similar keywords while preserving relationships"""
        filtered = []
        seen_stems = set()
        
        # Sort by type priority and confidence-adjusted score
        keywords.sort(key=lambda x: (
            {'entity': 2, 'concept': 1, 'term': 0}[x.keyword_type],
            x.score
        ), reverse=True)
        
        stemmer = nltk.PorterStemmer()
        
        try:
            for kw in keywords:
                stems = {stemmer.stem(word) for word in kw.keyword.lower().split()}
                is_multi_word = len(kw.keyword.split()) > 1
                is_entity = kw.keyword_type == 'entity'
                
                # Additional check for entities
                if is_entity and hasattr(self, 'entity_context'):
                    # Prefer entities with more evidence
                    evidence_count = sum(1 for ev in self.entity_context.evidence.values()
                                    if kw.keyword in (ev.source, ev.target))
                    if evidence_count > 0:
                        filtered.append(kw)
                        continue
                
                if is_entity or is_multi_word or not stems.intersection(seen_stems):
                    filtered.append(kw)
                    if not is_multi_word and not is_entity:
                        seen_stems.update(stems)
            
            return filtered
        except Exception as e:
            self.logger.error(f"Error in _filter_similar_keywords: {e}")
            return keywords


    def extract_keywords_hybrid(self, text: str, max_keywords: int = 20,
                              min_score: float = 0.05) -> List[KeywordResult]:
        """Extract keywords using multiple methods with relationship tracking"""

        context_id = str(uuid.uuid4())

        try:
            if not text or len(text.strip()) < self.min_chars:
                self.logger.warning("Text too short for keyword extraction")
                return []

            if not 0 <= min_score <= 1:
                raise ValueError("min_score must be between 0 and 1")
            
            self.content_context.start_processing(context_id)
            self._cleanup_context()
            self._initialize_context()

            # Clean text
            cleaned_text = self.html_processor.clean_html(text)
            if not cleaned_text or len(cleaned_text.strip()) < 10:
                self.logger.warning("Text too short for keyword extraction")
                return []
            
            # Extract keywords using different methods
            rake_keywords = self._extract_rake_keywords(cleaned_text)
            tfidf_keywords = self._extract_tfidf_keywords(cleaned_text)
            entity_keywords = self._extract_named_entities(cleaned_text)
            
            # Combine results
            combined_keywords = self._combine_keyword_scores(
                rake_keywords, tfidf_keywords, entity_keywords,
                min_score=min_score
            )
            
            # Convert to KeywordResult objects
            results = []
            seen_keywords = set()
            
            # Process different keyword types
            for keyword_type in ['entity', 'concept', 'term']:
                type_keywords = [
                    (k, v) for k, v in combined_keywords.items()
                    if v['type'] == keyword_type
                ]
                
                type_keywords.sort(key=lambda x: x[1]['score'], reverse=True)
                
                for keyword, data in type_keywords:
                    if keyword.lower() in seen_keywords:
                        continue
                        
                    if not self.validator.is_valid_phrase(keyword):
                        continue

                    # Get relationship confidence if available
                    confidence = self.content_context.get_entity_confidence(keyword)
                        
                    result = KeywordResult(
                        keyword=keyword,
                        score=data['score'] * confidence,
                        frequency=data['frequency'],
                        length=len(keyword.split()),
                        source='hybrid',
                        keyword_type=data['type'],
                        related_terms=data['related_terms']
                    )
                    results.append(result)
                    seen_keywords.add(keyword.lower())
            
            # Filter and limit results
            results = self._filter_similar_keywords(results)
            return results[:max_keywords]
            
        except Exception as e:
            self.logger.error(f"Error in hybrid extraction: {str(e)}", exc_info=True)
            return []
        finally:
            # Ensure cleanup happens even if processing fails
            if context_id:
                self.content_context.end_processing(context_id)