from typing import List, Set, Dict, Tuple
from dataclasses import dataclass, field
import re
import math
from bs4 import BeautifulSoup, Tag
import nltk
from rake_nltk import Rake, Metric
from sklearn.feature_extraction.text import TfidfVectorizer
from core.utils.logger import get_logger
import textwrap
from readability import Document


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

class TextCleaner:
    """Handles text cleaning and normalization"""
    
    def __init__(self):
        self.logger = get_logger(__name__)
        
        # UI text patterns
        self.ui_patterns = [
            r'(^|\s)(nav|menu|footer|sidebar|banner|modal|popup|cookie|newsletter)',
            r'(^|\s)(language|lang-select|search|login|signup|social)',
            r'(^|\s)(toolbar|breadcrumb|pagination|tabs|drawer)',
            r'(^|\s)(button|dialog|tooltip|dropdown)',
        ]
        self.ui_roles = {
            'navigation', 'menubar', 'toolbar', 'complementary', 'banner'
        }
        self.ui_text_patterns = [
            r'\b(click|tap|press|select|choose)\b',
            r'\b(login|logout|sign in|sign up|register)\b',
            r'\b(menu|navigation|sidebar|toolbar)\b',
            r'(·|•|›|»|→)',  # Common UI separators
            r'\b(previous|next|back|forward)\b',
            r'\b(loading|please wait)\b',
            r'^\s*(\w+\s*[•·]\s*)+\w+\s*$',  # Language/navigation patterns
        ]
        
        # Initialize stopwords and punctuation
        self.stopwords = self._get_stopwords()
        self.punctuation = self._get_punctuations()
    
    def normalize_text(self, text: str) -> str:
        """Normalize whitespace and clean text"""
        # Remove UI separators
        text = re.sub(r'\s*[•·›»→]\s*', ' ', text)
        # Fix common join issues
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        # Remove social media artifacts
        text = re.sub(r'(Copy|Link|Share|Facebook|Twitter|Email)\s*', '', text, flags=re.I)
        # Normalize whitespace
        text = ' '.join(text.split())
        return text
    
    def is_ui_text(self, text: str) -> bool:
        """Check if text matches common UI patterns"""
        text = text.lower()
        for pattern in self.ui_text_patterns:
            if re.search(pattern, text):
                print(f"UI pattern matched: {pattern}")
                return True
        return False
    
    def is_substantial_text(self, text: str, min_length: int = 20) -> bool:
        """Check if text is long enough and not UI-related"""
        text = self.normalize_text(text)
        is_ui = self.is_ui_text(text)
        return len(text) >= min_length and not is_ui
    
    def _get_stopwords(self) -> Set[str]:
        """Get enhanced stopwords including common non-keyword terms"""
        stopwords = set(nltk.corpus.stopwords.words('english'))
        
        # Add common web/UI terms
        ui_stopwords = {
            'click', 'tap', 'press', 'select', 'choose', 'menu', 'navigation',
            'login', 'logout', 'sign', 'register', 'previous', 'next', 'back',
            'forward', 'loading', 'please', 'wait', 'search', 'close', 'open',
            'show', 'hide', 'toggle', 'enable', 'disable', 'accept', 'cancel',
            'submit', 'reset', 'update', 'refresh', 'reload', 'scroll'
        }
        
        # Add common non-keyword verbs
        common_verbs = {
            'make', 'made', 'making', 'take', 'took', 'taking', 'get', 'got',
            'getting', 'put', 'putting', 'use', 'used', 'using', 'try', 'tried',
            'trying', 'call', 'called', 'calling', 'work', 'worked', 'working'
        }
        
        # Add common connecting words
        connectors = {
            'like', 'such', 'via', 'etc', 'ie', 'eg', 'example', 'including',
            'include', 'included', 'includes', 'might', 'may', 'could', 'would',
            'should', 'must', 'shall', 'will', 'can', 'cannot', 'cant'
        }
        
        return stopwords.union(ui_stopwords, common_verbs, connectors)
    
    def _get_punctuations(self) -> Set[str]:
        """Get punctuation marks to be treated as word separators"""
        return {
            '。', '，', '、', '；', '：', '？', '！', '（', '）', '《', '》',
            '"', '"', ''', ''', '.', ',', '!', '?', ';', ':', '(', ')', '[',
            ']', '{', '}', '"', "'", ''', ''', '•', '·', '|', '/', '\\', '-',
            '_', '+', '=', '@', '#', '$', '%', '^', '&', '*'
        }

class HTMLProcessor:
    """Handles HTML parsing and content extraction"""
    
    def __init__(self, text_cleaner: TextCleaner):
        self.logger = get_logger(__name__)
        self.text_cleaner = text_cleaner
        
        # Common content-containing elements
        self.content_ids = {
            'entry', 'main', 'content', 'article', 'post', 
            'body', 'page', 'story', 'text'
        }
        
        # Elements that should be removed
        self.unwanted_elements = {
            'script', 'style', 'link', 'iframe', 'noscript',
            'nav', 'footer', 'header', 'aside', 'button',
            'navigation', 'menu', 'sidebar', 'banner', 'modal',
            'popup', 'cookie', 'newsletter', 'social', 'sharing',
            'share', 'related', 'comments'
        }

        self.content_selectors = {
            '#entry', '#main', '#content', '#article',
            '.entry', '.content', '.article', '.post',
            'article', 'main', '[role="main"]',
            '[itemprop="articleBody"]',
            '.page-header .lead',
            '.panel-body'
        }
    
    def clean_html(self, html_text: str) -> str:
        """Process HTML and extract meaningful content"""
        if '<' not in html_text or '>' not in html_text:
            return html_text
            
        # Use readability to extract main content
        doc = Document(html_text)
        content_html = doc.summary()
        
        # Parse the extracted content with BeautifulSoup to clean it
        soup = BeautifulSoup(content_html, 'html.parser')
        
        # Get text and normalize it
        cleaned_text = self.text_cleaner.normalize_text(soup.get_text())
        
        self.logger.debug(f"Total content length: {len(cleaned_text)} characters")
        
        if not cleaned_text:
            self.logger.warning("No content extracted from HTML")
        elif len(cleaned_text) < 100:
            self.logger.warning(f"Very little content extracted: {len(cleaned_text)} chars")
            
        return cleaned_text
    
    def _remove_unwanted_elements(self, soup: BeautifulSoup) -> None:
        """Remove all unwanted elements from the soup"""
        # Remove by tag name
        for element in soup.find_all(self.unwanted_elements):
            element.decompose()
        
        # Remove by role
        for element in soup.find_all(attrs={'role': list(self.text_cleaner.ui_roles)}):
            element.decompose()
        
        # Remove by class pattern
        for pattern in self.text_cleaner.ui_patterns:
            for element in soup.find_all(class_=re.compile(pattern, re.I)):
                element.decompose()
    
    def _should_keep_element(self, element: Tag) -> bool:
        """Determine if an element should be kept"""
        # Check for unwanted elements first
        if element.name in self.unwanted_elements:
            return False
            
        # Then check for no attributes case
        if not element.attrs:
            return True
        
        # Check for content identifiers
        if element.get('id', '').lower() in self.content_ids:
            return True
        
        if element.get('class'):
            classes = ' '.join(element.get('class', [])).lower()
            if any(term in classes for term in self.content_ids):
                return True
        
        return True
    

    def _extract_content(self, soup: BeautifulSoup) -> List[str]:
        """Extract content from cleaned HTML"""
        content = []
        
        # Handle headers specially
        for header in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            text = self.text_cleaner.normalize_text(header.get_text())
            if text:
                # Add extra spacing around headers
                content.append("")
                content.append(text)
                content.append("")
        
        # Get paragraph content
        for p in soup.find_all('p'):
            text = self.text_cleaner.normalize_text(p.get_text())
            if len(text) >= 20:
                content.append(text)
        
        # If no paragraphs found, try other selectors
        if not content:
            for selector in self.content_selectors:
                for element in soup.select(selector):
                    text = self.text_cleaner.normalize_text(element.get_text())
                    if len(text) >= 20:
                        content.append(text)
        
        # Clean and normalize the combined text
        cleaned_text = ' '.join(content)
        # Remove multiple spaces
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
        # Remove UI artifacts
        cleaned_text = re.sub(r'(Copy|Link|Share|Facebook|Twitter|Email)\s*', '', cleaned_text, flags=re.I)
        # Fix common join artifacts
        cleaned_text = re.sub(r'([a-z])([A-Z])', r'\1 \2', cleaned_text)
        
        return [cleaned_text]

class KeywordExtractor:
    """Handles keyword extraction and scoring"""
    
    def __init__(self, 
                 text_cleaner: TextCleaner,
                 html_processor: HTMLProcessor,
                 min_chars: int = 3,
                 max_words: int = 4,
                 spacy_model: str = "en_core_web_sm"):
        self.logger = get_logger(__name__)
        self.text_cleaner = text_cleaner
        self.html_processor = html_processor
        self.min_chars = min_chars
        self.max_words = max_words
        
        if spacy_model:
            import spacy
            self.nlp = spacy.load(spacy_model)
        
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
            min_df=1,      # Accept terms that appear in at least 1 document
            max_df=1.0,    # No upper limit on document frequency
            lowercase=True,
            sublinear_tf=True  # Apply sublinear scaling to term frequencies
        )

    
    def is_valid_phrase(self, phrase: str) -> bool:
        """Check if phrase represents a valid keyword concept"""
        words = phrase.lower().split()
        
        # Special case for common acronyms and abbreviations
        allowed_short_terms = {
            # Countries/Regions
            'us', 'uk', 'eu', 'un', 'uae',
            # Tech/Business
            'ai', 'ar', 'vr', 'ip', 'os', 'ui', 'ux',
            # Organizations
            'un', 'who', 'fbi', 'cia', 'nsa',
            # States
            'ny', 'ca', 'tx', 'fl'
        }
        if phrase.lower() in allowed_short_terms:
            return True

        # Basic validations
        if len(words) > self.max_words:
            return False
        
        # Check for stopwords at start/end
        if words[0] in self.text_cleaner.stopwords or words[-1] in self.text_cleaner.stopwords:
            return False
        
        # Check for numbers and invalid patterns
        invalid_patterns = [
            r'[0-9\(\)\[\]\{\}]',  # Numbers and special characters
            r'^(how|what|when|where|why|who)\s',  # Question words
            r'\s(of|to|for|in|on|at|by|with)\s',  # Prepositions
            r'\s(and|or|but|nor|yet|so)\s',  # Conjunctions
            r'(https?|ftp):\/\/',  # URLs
            r'[^a-zA-Z\s-]',  # Non-letter characters except spaces and hyphens
        ]
        
        if any(re.search(pattern, phrase.lower()) for pattern in invalid_patterns):
            return False

        # Check phrase structure using spaCy
        doc = self.nlp(phrase)
        
        # Must have at least one noun
        if not any(token.pos_ in {'NOUN', 'PROPN'} for token in doc):
            return False
        
        # Must match valid conceptual patterns
        valid_patterns = [
            ['NOUN'],
            ['PROPN'],
            ['ADJ', 'NOUN'],
            ['ADJ', 'PROPN'],
            ['NOUN', 'NOUN'],
            ['PROPN', 'NOUN'],
            ['NOUN', 'PROPN'],
            ['ADJ', 'ADJ', 'NOUN'],
            ['ADJ', 'NOUN', 'NOUN'],
            ['NOUN', 'NOUN', 'NOUN']
        ]
        
        pos_sequence = [token.pos_ for token in doc]
        
        # No verbs allowed (keeps focus on concepts rather than actions)
        if any(token.pos_ == 'VERB' for token in doc):
            return False
            
        return pos_sequence in valid_patterns
    

    def calculate_phrase_score(self, phrase: str, base_score: float,
                             frequency: int, text: str) -> float:
        """Calculate adjusted score for a phrase"""
        score = base_score
        words = phrase.split()
        
        # Length adjustment
        if len(words) in {2, 3}:
            score *= 1.2
        elif len(words) > 3:
            score *= 0.9
        
        # Frequency adjustment
        score *= (1 + math.log(frequency + 1, 2))
        
        # Cohesion score
        if len(words) > 1:
            word_freqs = [text.lower().count(word.lower()) for word in words]
            avg_freq = sum(word_freqs) / len(word_freqs)
            if avg_freq > 0:
                score *= (1 + frequency / avg_freq)
        
        # Position bonus
        first_pos = text.lower().find(phrase.lower())
        if 0 <= first_pos < len(text) / 5:
            score *= 1.2
        
        return score
    
    def extract_keywords(self, text: str, max_keywords: int = 10,
                        min_score: float = 1.0) -> List[KeywordResult]:
        """Extract keywords from text"""
        try:
            # Clean text
            cleaned_text = self.html_processor.clean_html(text)
            if not cleaned_text or len(cleaned_text.strip()) < 10:
                self.logger.warning("Text too short for keyword extraction")
                return []
            
            # Extract candidate phrases
            self.rake.extract_keywords_from_text(cleaned_text)
            phrases_scores = self.rake.get_ranked_phrases_with_scores()
            
            # Process candidates
            results = []
            seen_keywords = set()
            
            for score, phrase in phrases_scores:
                if score < min_score:
                    continue
                
                phrase = phrase.strip()
                phrase_lower = phrase.lower()
                
                if phrase_lower in seen_keywords:
                    continue
                
                if not self.is_valid_phrase(phrase):
                    continue
                
                freq = len(re.findall(r'\b' + re.escape(phrase_lower) + r'\b',
                                    cleaned_text.lower()))
                
                if freq > 0:
                    adjusted_score = self.calculate_phrase_score(
                        phrase, score, freq, cleaned_text
                    )
                    
                    results.append(KeywordResult(
                        keyword=phrase,
                        score=adjusted_score,
                        frequency=freq,
                        length=len(phrase.split()),
                        source='rake',
                        keyword_type='phrase'
                    ))
                    seen_keywords.add(phrase_lower)
            
            # Sort and limit results
            results.sort(key=lambda x: x.score, reverse=True)
            return results[:max_keywords]
            
        except Exception as e:
            self.logger.error(f"Error extracting keywords: {e}", exc_info=True)
            return []
        


    
    def _extract_rake_keywords(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Extract keywords using RAKE with focus on key concepts"""
        self.rake.extract_keywords_from_text(text)
        phrases_scores = self.rake.get_ranked_phrases_with_scores()
        
        keywords = {}
        for score, phrase in phrases_scores:
            phrase = phrase.strip()
            
            if self.is_valid_phrase(phrase):
                freq = len(re.findall(r'\b' + re.escape(phrase.lower()) + r'\b',
                                    text.lower()))
                if freq > 0:
                    # Simple frequency-based scoring
                    adjusted_score = score * math.log(1 + freq)
                    keywords[phrase] = (adjusted_score, freq)
        
        return keywords
        
    def _extract_tfidf_keywords(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Extract keywords using TF-IDF"""
        self.logger.debug(f"Starting TF-IDF extraction on text of length {len(text)}")
        
        try:
            # Fit TF-IDF
            tfidf_matrix = self.tfidf.fit_transform([text])
            feature_names = self.tfidf.get_feature_names_out()
            
            self.logger.debug(f"Found {len(feature_names)} unique terms")
            
            # Get scores
            keywords = {}
            scores = tfidf_matrix.toarray()[0]
            
            # Sort by score for logging
            term_scores = [(feature_names[idx], score) for idx, score in enumerate(scores)]
            term_scores.sort(key=lambda x: x[1], reverse=True)
            
            # Log top terms
            self.logger.debug("Top 10 TF-IDF terms:")
            for term, score in term_scores[:10]:
                self.logger.debug(f"  {term:<30} Score: {score:.4f}")
            
            # Build result dictionary with improved frequency counting
            for term, score in term_scores:
                if score > 0:
                    # Handle both single words and phrases
                    if ' ' in term:
                        # For phrases, escape special chars and ensure word boundaries
                        pattern = r'\b' + r'\s+'.join(re.escape(word) for word in term.split()) + r'\b'
                    else:
                        # For single words, simpler pattern
                        pattern = r'\b' + re.escape(term) + r'\b'
                    
                    freq = len(re.findall(pattern, text.lower()))
                    
                    # Only add terms that actually appear in the text
                    if freq > 0:
                        keywords[term] = (score, freq)
                        self.logger.debug(f"Added keyword: {term} (score={score:.4f}, freq={freq})")
                    else:
                        self.logger.debug(f"Skipped term with zero frequency: {term}")
            
            self.logger.debug(f"Extracted {len(keywords)} keywords with non-zero scores and frequencies")
            return keywords
            
        except Exception as e:
            self.logger.error(f"Error in TF-IDF extraction: {str(e)}", exc_info=True)
            return {}
    
    def _extract_named_entities(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Extract named entities using spaCy with enhanced relationship tracking"""
        doc = self.nlp(text)
        keywords = {}
        
        # Track entities and their relationships
        entity_relationships = {}
        
        for ent in doc.ents:
            if ent.label_ in {'ORG', 'PERSON', 'PRODUCT', 'GPE', 'WORK_OF_ART'}:
                # Frequency of the entity
                freq = len(re.findall(r'\b' + re.escape(ent.text.lower()) + r'\b',
                                    text.lower()))
                
                # Store the entity
                keywords[ent.text] = (1.0, freq)
                
                # Track relationships for people associated with organizations
                if ent.label_ == 'PERSON':
                    # Find organizations mentioned in the context near this person
                    nearby_orgs = [
                        nearby_ent.text for nearby_ent in doc.ents 
                        if nearby_ent.label_ == 'ORG' and 
                        abs(nearby_ent.start - ent.start) < 10  # Within 10 tokens
                    ]
                    
                    if nearby_orgs:
                        entity_relationships[ent.text] = nearby_orgs
        
        # Enhance entity keywords with relationship information
        for entity, orgs in entity_relationships.items():
            for org in orgs:
                if org in keywords:
                    # Add the person to the organization's related terms
                    keywords[org] = (keywords[org][0], keywords[org][1])
        
        return keywords
    
    
    def _is_valid_keyword(self, phrase: str) -> bool:
        """Check if phrase represents a valid keyword concept"""
        # Use spaCy for more robust linguistic analysis
        doc = self.nlp(phrase)
        words = phrase.lower().split()
        
        # Basic length checks
        if len(words) > self.max_words:
            return False
        
        # Check for meaningful linguistic composition
        pos_tags = [token.pos_ for token in doc]
        
        # Validate keyword structure
        valid_patterns = [
            # Single meaningful word types
            ['NOUN'], ['PROPN'], ['ADJ'], 
            # Two-word combinations
            ['ADJ', 'NOUN'], ['NOUN', 'NOUN'], 
            ['PROPN', 'NOUN'], ['NOUN', 'PROPN'],
            ['ADJ', 'PROPN'], 
            # Three-word combinations
            ['ADJ', 'ADJ', 'NOUN'], 
            ['ADJ', 'NOUN', 'NOUN'],
            ['NOUN', 'NOUN', 'NOUN']
        ]
        
        # Check for meaningful content
        meaningful_content = (
            # Ensure at least one substantive word type
            any(pos in {'NOUN', 'PROPN', 'ADJ'} for pos in pos_tags) and
            # Reject if all words are stopwords
            not all(word in self.text_cleaner.stopwords for word in words)
        )
        
        # Check if POS sequence matches any valid pattern
        pattern_match = pos_tags in valid_patterns
        
        # Additional checks to reject obvious non-keywords
        additional_filters = (
            # Reject pure numeric sequences
            not any(word.isdigit() for word in words) and
            # Reject URLs and file paths
            not any(word.startswith(('http', 'www', '/', '.')) for word in words) and
            # Reject pure punctuation or special character sequences
            not all(not char.isalnum() for char in phrase)
        )
        
        return meaningful_content and pattern_match and additional_filters
    
    def _determine_keyword_type(self, keyword: str) -> str:
        """Determine the type of keyword"""
        doc = self.nlp(keyword)
        
        # Check if it's a named entity
        if doc.ents:
            return doc.ents[0].label_
        
        # Check if it's a noun phrase
        if any(token.pos_ in {'NOUN', 'PROPN'} for token in doc):
            return 'noun_phrase'
        
        return 'other'
    

    def _extract_rake_keywords(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Extract keywords using RAKE"""
        # For large documents, process in chunks
        if len(text) > 50000:  # 50KB threshold
            chunks = textwrap.wrap(text, 50000)
            all_keywords = {}
            
            for chunk in chunks:
                chunk_keywords = self._process_text_chunk(chunk)
                # Merge results
                for phrase, (score, freq) in chunk_keywords.items():
                    if phrase in all_keywords:
                        existing_score, existing_freq = all_keywords[phrase]
                        all_keywords[phrase] = (max(score, existing_score), 
                                            existing_freq + freq)
                    else:
                        all_keywords[phrase] = (score, freq)
                        
            return self._normalize_scores(all_keywords)
        
        # For smaller documents, process normally
        keywords = self._process_text_chunk(text)
        return self._normalize_scores(keywords)


    def _process_text_chunk(self, text: str) -> Dict[str, Tuple[float, int]]:
        """Process a single chunk of text"""
        self.rake.extract_keywords_from_text(text)
        phrases_scores = self.rake.get_ranked_phrases_with_scores()
        
        keywords = {}
        for score, phrase in phrases_scores:
            phrase = phrase.strip()
            
            # Skip very short or very long phrases
            if len(phrase.split()) > self.max_words or len(phrase) < self.min_chars:
                continue
                
            freq = len(re.findall(r'\b' + re.escape(phrase.lower()) + r'\b',
                                text.lower()))
            
            if freq > 0:
                # Base score adjustment
                adjusted_score = score * math.log(1 + freq)
                
                # Penalize single occurrence phrases
                if freq == 1:
                    adjusted_score *= 0.5
                    
                # Length-based adjustments
                words = phrase.split()
                if len(words) == 2:  # Slight boost for two-word phrases
                    adjusted_score *= 1.1
                elif len(words) > 3:  # Penalty for very long phrases
                    adjusted_score *= 0.8
                
                # Add to results if score is significant
                if adjusted_score > 0.5:
                    keywords[phrase] = (adjusted_score, freq)
        
        return keywords

    def _normalize_scores(self, keywords: Dict[str, Tuple[float, int]]) -> Dict[str, Tuple[float, int]]:
        """Normalize scores within a document"""
        if not keywords:
            return keywords
            
        scores = [score for score, _ in keywords.values()]
        min_score = min(scores)
        max_score = max(scores)
        
        # Avoid division by zero
        score_range = max_score - min_score
        if score_range == 0:
            return keywords
        
        normalized = {}
        for phrase, (score, freq) in keywords.items():
            # Scale to 1-10 range
            norm_score = 1 + 9 * ((score - min_score) / score_range)
            normalized[phrase] = (norm_score, freq)
        
        return normalized
    

    def extract_keywords_hybrid(self, text: str, max_keywords: int = 20,
                            min_score: float = 0.05) -> List[KeywordResult]:
        """Extract keywords using multiple methods with graph-aware combination"""
        try:
            # Clean text
            cleaned_text = self.html_processor.clean_html(text)
            if not cleaned_text or len(cleaned_text.strip()) < 10:
                self.logger.warning("Text too short for keyword extraction")
                return []
            
            # Get keywords from different methods
            rake_keywords = self._extract_rake_keywords(cleaned_text)
            tfidf_keywords = self._extract_tfidf_keywords(cleaned_text)
            entity_keywords = self._extract_named_entities(cleaned_text)

            # Debug logging
            print("RAKE Keywords:", list(rake_keywords.keys()))
            print("TF-IDF Keywords:", list(tfidf_keywords.keys()))
            print("Entity Keywords:", list(entity_keywords.keys()))

            self.logger.debug(f"Initial extraction results:"
                         f"\nRAKE: {list(rake_keywords.keys())[:5]}"
                         f"\nTF-IDF: {list(tfidf_keywords.keys())[:5]}"
                         f"\nEntities: {list(entity_keywords.keys())}")
            
            # Combine with relationship awareness
            combined_keywords = self._combine_keyword_scores(
                rake_keywords, 
                tfidf_keywords, 
                entity_keywords,
                min_score=min_score  # Pass through from the hybrid method
            )

            # More detailed debug logging
            print("Combined Keywords:")
            for kw, details in combined_keywords.items():
                print(f"{kw}: Type={details['type']}, Score={details['score']}")
                
            # Show sample of combined results
            sample_combined = {k: v['related_terms'] 
                            for k, v in list(combined_keywords.items())[:5]}
            print(f"Sample combined results with relationships: {sample_combined}")

            # Convert to KeywordResult objects
            results = []
            seen_keywords = set()

            # Explicitly collect full person names
            full_person_names = [
                kw for kw, details in combined_keywords.items() 
                if details['type'] == 'entity' and ' ' in kw
            ]

            acronyms = [
                kw for kw, details in combined_keywords.items() 
                if len(kw) <= 3 and kw.isupper() and details['type'] in ['entity', 'term']
            ]
            
            # Prioritize meaningful multi-word phrases
            meaningful_phrases = [
                kw for kw, details in combined_keywords.items()
                if (len(kw.split()) > 1 and  # Multi-word
                    details['type'] in ['concept', 'term'] and  # From concept or term types
                    self._is_valid_keyword(kw))  # Passes validity check
            ]

            # Process in order: entities -> concepts -> terms
            keyword_types = ['entity', 'concept', 'term']
            for keyword_type in keyword_types:
                type_keywords = [
                    (k, v) for k, v in combined_keywords.items()
                    if v['type'] == keyword_type
                ]
                
                # Sort by score within each type
                type_keywords.sort(key=lambda x: x[1]['score'], reverse=True)
                
                for keyword, data in type_keywords:
                    if keyword.lower() in seen_keywords:
                        continue
                    
                    if not self._is_valid_keyword(keyword):
                        continue
                    
                    # Explicitly add full person names to organization entities
                    if keyword_type == 'entity' and data['type'] == 'entity':
                        # Add any full person names that weren't already added
                        for full_name in full_person_names:
                            if full_name not in data['related_terms']:
                                data['related_terms'].append(full_name)

                        # Add acronyms to related terms
                        for acronym in acronyms:
                            if acronym not in data['related_terms']:
                                data['related_terms'].append(acronym)

                    # For concept keywords, ensure acronyms are added
                    if keyword_type == 'concept':
                        for acronym in acronyms:
                            if acronym not in data['related_terms']:
                                data['related_terms'].append(acronym)
                    
                    result = KeywordResult(
                        keyword=keyword,
                        score=data['score'],
                        frequency=data['frequency'],
                        length=len(keyword.split()),
                        source='hybrid',
                        keyword_type=data['type'],
                        related_terms=data['related_terms']
                    )
                    results.append(result)
                    seen_keywords.add(keyword.lower())
            
            # Add top meaningful phrases if not already included
            for phrase in meaningful_phrases:
                if phrase.lower() not in seen_keywords:
                    data = combined_keywords[phrase]
                    result = KeywordResult(
                        keyword=phrase,
                        score=data['score'],
                        frequency=data.get('frequency', 1),
                        length=len(phrase.split()),
                        source='hybrid',
                        keyword_type=data['type'],
                        related_terms=data.get('related_terms', [])
                    )
                    results.append(result)
                    seen_keywords.add(phrase.lower())

            # Filter and limit results
            results = self._filter_similar_keywords(results)
            return results[:max_keywords]
            
        except Exception as e:
            self.logger.error(f"Error extracting keywords: {e}", exc_info=True)
            return []


    def _combine_keyword_scores(self, rake_kw: Dict, tfidf_kw: Dict, 
                            entity_kw: Dict, min_score: float = 0.1) -> Dict[str, Dict]:
        """Combine scores with relationship awareness"""
        combined = {}

        # First add named entities with relationship tracking
        for keyword, (score, freq) in entity_kw.items():
            combined[keyword] = {
                'score': score * 1.2,  # Boost entities slightly
                'frequency': freq,
                'type': 'entity',
                'related_terms': []
            }
            
             # Collect all entities and their components
            entity_names = {}
            for keyword in entity_kw.keys():
                # Break down multi-word entity names
                parts = keyword.split()
                
                # Store full name and its parts
                entity_names[keyword] = {
                    'full': keyword,
                    'parts': [part.lower() for part in parts]
                }

        # Explicitly track relationships between entities
        for main_entity in combined.keys():
            for other_entity, details in entity_names.items():
                if main_entity == other_entity:
                    continue
                
                # Check for strong relationship conditions
                is_related = (
                    # Full name contains main entity name
                    details['full'].lower().find(main_entity.lower()) != -1 or
                    # Main entity contains full name of other entity
                    main_entity.lower().find(details['full'].lower()) != -1 or
                    # Any part of the other entity is in the main entity
                    any(part in main_entity.lower() for part in details['parts'])
                )
                
                if is_related and details['full'] not in combined[main_entity]['related_terms']:
                    combined[main_entity]['related_terms'].append(details['full'])

        # Add RAKE phrases, ensuring 'concept' type
        for phrase, (score, freq) in rake_kw.items():
            # Look for contained entities
            related_entities = [
                entity for entity in entity_kw.keys()
                if (entity.lower() in phrase.lower() or 
                    any(part.lower() in phrase.lower() for part in entity.split()))
            ]

            # Bidirectional relationships for entities
            for entity in related_entities:
                if entity in combined:
                    # Add phrase to entity's related terms
                    if phrase not in combined[entity]['related_terms']:
                        combined[entity]['related_terms'].append(phrase)

            # Specifically apply 'concept' type to RAKE phrases
            combined[phrase] = {
                'score': score,
                'frequency': freq,
                'type': 'concept',
                'related_terms': related_entities
            }

        # Add TF-IDF terms with 'term' type
        for term, (score, freq) in tfidf_kw.items():
            if score > min_score and term not in combined:
                related_items = [
                    k for k in combined.keys()
                    if (term.lower() in k.lower() or 
                        k.lower() in term.lower())
                ]
                
                # Bidirectional relationships 
                for item in related_items:
                    if term not in combined[item]['related_terms']:
                        combined[item]['related_terms'].append(term)
                
                combined[term] = {
                    'score': score * 0.8,  # Slightly lower weight for single terms
                    'frequency': freq,
                    'type': 'term',
                    'related_terms': related_items
                }

        return combined

    def _filter_similar_keywords(self, keywords: List[KeywordResult]) -> List[KeywordResult]:
        """Remove similar or redundant keywords while preserving relationships"""
        filtered = []
        seen_stems = set()
        
        # Sort by type priority and score
        keywords.sort(key=lambda x: (
            {'entity': 2, 'concept': 1, 'term': 0}[x.keyword_type],
            x.score
        ), reverse=True)
        
        stemmer = nltk.PorterStemmer()
        
        for kw in keywords:
            # Get stems for all words in keyword
            stems = {stemmer.stem(word) for word in kw.keyword.lower().split()}
            
            # Be more lenient with multi-word phrases and entities
            is_multi_word = len(kw.keyword.split()) > 1
            is_entity = kw.keyword_type == 'entity'
            
            # Modify the filtering condition
            if is_entity or is_multi_word or not stems.intersection(seen_stems):
                filtered.append(kw)
                # Only add stems for single-word terms
                if not is_multi_word and not is_entity:
                    seen_stems.update(stems)
        
        return filtered
