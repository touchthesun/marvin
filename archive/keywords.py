from typing import List, Set
from dataclasses import dataclass
import re
import math
from bs4 import BeautifulSoup, Tag
import nltk
from rake_nltk import Rake, Metric
from core.utils.logger import get_logger

@dataclass
class KeywordResult:
    """Stores keyword extraction results with metadata"""
    keyword: str
    score: float
    frequency: int
    length: int
    source: str  # Indicates which method found this keyword (rake/spacy/combined)
    keyword_type: str  # Entity type for named entities, 'phrase' for RAKE keywords

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
        """Normalize whitespace and remove UI separators"""
        text = re.sub(r'\s*[•·›»→]\s*', ' ', text)
        return ' '.join(text.split())
    
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
            
        soup = BeautifulSoup(html_text, 'html.parser')
        
        # Remove unwanted elements
        self._remove_unwanted_elements(soup)
        
        # Extract content
        content = self._extract_content(soup)
        
        # Combine all content
        cleaned_text = ' '.join(content)
        
        self.logger.debug(f"Found {len(content)} content sections")
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
        
        # First try getting text from paragraph tags
        for p in soup.find_all('p'):
            text = self.text_cleaner.normalize_text(p.get_text())
            # Only check length, not UI text for paragraphs
            if len(text) >= 20:
                content.append(text)
        
        # If no paragraphs found, try other selectors
        if not content:
            for selector in self.content_selectors:
                for element in soup.select(selector):
                    text = self.text_cleaner.normalize_text(element.get_text())
                    if len(text) >= 20:
                        content.append(text)
        
        return content

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
            max_length=max_words * 5,
            ranking_metric=Metric.DEGREE_TO_FREQUENCY_RATIO,
            stopwords=text_cleaner.stopwords,
            punctuations=text_cleaner.punctuation
        )
    
    def is_valid_phrase(self, phrase: str) -> bool:
        """Check if a phrase is valid for use as a keyword"""
        words = phrase.lower().split()
        
        # Basic length checks
        if len(words) > self.max_words:
            return False
        
        # Check for numbers and special characters
        if re.search(r'[0-9\(\)\[\]\{\}]', phrase):
            return False
        
        # Check for stopwords at start/end
        if words[0] in self.text_cleaner.stopwords or words[-1] in self.text_cleaner.stopwords:
            return False
        
        # Check for invalid patterns
        invalid_patterns = [
            r'^(how|what|when|where|why|who)\s',
            r'\s(of|to|for|in|on|at|by|with)\s',
            r'\s(and|or|but|nor|yet|so)\s',
            r'(https?|ftp):\/\/',
            r'[^a-zA-Z\s-]',
        ]
        
        if any(re.search(pattern, phrase.lower()) for pattern in invalid_patterns):
            return False
        
        # Check phrase structure
        doc = self.nlp(phrase)
        return any(token.pos_ in {'NOUN', 'PROPN'} for token in doc) and \
               not any(token.pos_ == 'VERB' for token in doc)
    
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