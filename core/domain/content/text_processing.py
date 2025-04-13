import re
import nltk
from readability import Document
from bs4 import BeautifulSoup
from typing import List, Set

from api.utils.helpers import get_domain_from_url
from core.domain.content.config import ContentProcessorConfig
from core.utils.logger import get_logger




class TextCleaner:
    """Text preprocessing and cleaning utility for keyword extraction.
    
    This class handles text normalization, UI text detection, and content filtering
    to prepare text for keyword extraction. It maintains lists of stopwords and UI-specific
    patterns to ensure only meaningful content is processed.
    
    Attributes:
        ui_patterns (List[str]): Regular expressions for identifying UI elements
        ui_roles (Set[str]): HTML roles associated with UI elements
        stopwords (Set[str]): Set of words to exclude from keyword extraction
        punctuation (Set[str]): Set of punctuation marks to handle during cleaning
        logger: Logger instance for tracking cleaning operations
        
    Methods:
        normalize_text: Standardizes text format and removes UI artifacts
        is_ui_text: Determines if text is UI-related
    """
    
    def __init__(self):
        self.logger = get_logger(__name__)
        # Initialize stopwords and punctuation
        self.stopwords = self._get_stopwords()
        self.punctuation = self._get_punctuations()
        
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
        
        # Initialize stopwords and punctuation
        self.stopwords = self._get_stopwords()
        self.punctuation = self._get_punctuations()
    
    def normalize_text(self, text: str) -> str:
        """Normalize text by handling special characters and spacing"""
        if not text:
            return text
            
        # Replace punctuation with spaces
        for punct in self.punctuation:
            text = text.replace(punct, ' ')
        
        # Handle camelCase
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        
        # Normalize spaces
        text = re.sub(r'\s+', ' ', text)
        
        # Strip leading/trailing whitespace
        return text.strip()

    
    
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
    """HTML content extraction and cleaning for keyword extraction.
    
    Processes HTML documents to extract meaningful content while filtering out
    navigation elements, ads, and other non-content sections. Uses readability
    algorithms and custom heuristics to identify main content.
    
    Attributes:
        text_cleaner (TextCleaner): Instance for text normalization
        content_ids (Set[str]): Common HTML IDs/classes for content elements
        unwanted_elements (Set[str]): HTML elements to remove
        content_selectors (Set[str]): CSS selectors for content elements
        logger: Logger instance for tracking HTML processing
    
    Methods:
        clean_html: Main method for extracting clean text from HTML
        _extract_content: Pulls clean text from content elements
    """
    
    def __init__(self, text_cleaner: TextCleaner):
        self.logger = get_logger(__name__)
        self.text_cleaner = text_cleaner
        
        # Common content-containing elements
        self.content_ids = {
            'entry', 'main', 'content', 'article', 'post', 
            'body', 'page', 'story', 'text', 'app', 'data',
            'list', 'table'  # Added common content containers
        }
        
        # Elements that should always be removed
        self.unwanted_elements = {
            'script', 'style', 'link', 'iframe', 'noscript',
            'cookie', 'newsletter', 'comments'
        }
        
        # Keep navigation when it might contain valuable content
        self.content_selectors = {
            # Main content areas
            '#entry', '#main', '#content', '#article',
            '.entry', '.content', '.article', '.post',
            'article', 'main', '[role="main"]',
            '[itemprop="articleBody"]',
            '.page-header .lead',
            '.panel-body',
            
            # Word lists and data
            '.word-list', '.wordlist', '.words',
            '.data-list', '.data-table',
            'table.data', 'table.words',
            '[class*="word-"]', '[id*="word-"]',
            '[class*="data-"]', '[id*="data-"]',
            
            # List structures
            'ul.list', 'ol.list', 'dl.list',
            '.list-container', '.list-content',
            '[class*="list-"]', '[id*="list-"]'
        }
    
    def clean_html(self, html_text: str) -> str:
        """Process HTML and extract meaningful content."""
        if '<' not in html_text or '>' not in html_text:
            return html_text
            
        try:
            # First use readability to get main content
            doc = Document(html_text)
            content_html = doc.summary()
            
            # Parse with BeautifulSoup
            soup = BeautifulSoup(content_html, 'html.parser')
            
            # Also parse original HTML for additional content
            full_soup = BeautifulSoup(html_text, 'html.parser')
            
            # Get content from main article (from readability)
            content_parts = self._extract_content(soup)
            
            # Look for additional content in specific areas of the full document
            for selector in self.content_selectors:
                for element in full_soup.select(selector):
                    additional_content = self._extract_content(element)
                    content_parts.extend(additional_content)
            
            # Check word list content specifically
            word_list_content = self._extract_word_lists(full_soup)
            if word_list_content:
                content_parts.extend(word_list_content)
            
            # Final check for any missed list-like content
            table_content = self._extract_table_content(full_soup)
            if table_content:
                content_parts.extend(table_content)
            
            # Join and normalize
            cleaned_text = ' '.join(content_parts)
            cleaned_text = self.text_cleaner.normalize_text(cleaned_text)
            
            self.logger.debug(f"Total content length: {len(cleaned_text)} characters")
            
            if not cleaned_text:
                self.logger.warning("No content extracted from HTML")
            elif len(cleaned_text) < 100:
                self.logger.warning(f"Very little content extracted: {len(cleaned_text)} chars")
            
            return cleaned_text
            
        except Exception as e:
            self.logger.error(f"HTML cleaning failed: {e}", exc_info=True)
            return html_text

    def _extract_word_lists(self, soup: BeautifulSoup) -> List[str]:
        """Specifically extract content that looks like word lists."""
        word_list_content = []
        
        # Look for word-list type patterns
        list_patterns = [
            'ul > li',  # Unordered lists
            'ol > li',  # Ordered lists
            'dl > dt',  # Definition lists
            '.word-list',  # Specific word list classes
            '[class*="word"]',  # Classes containing "word"
            '[id*="word"]',     # IDs containing "word"
            'table td',  # Table cells (might contain word lists)
        ]
        
        for pattern in list_patterns:
            elements = soup.select(pattern)
            for element in elements:
                text = element.get_text().strip()
                if text and len(text.split()) <= 3:  # Most word list entries are short
                    word_list_content.append(text)
        
        return word_list_content

    def _extract_table_content(self, soup: BeautifulSoup) -> List[str]:
        """Extract content from table structures."""
        table_content = []
        
        for table in soup.find_all('table'):
            # Skip tables that look like layouts
            if not table.find_all(['th', 'td'], limit=2):
                continue
                
            for cell in table.find_all(['td', 'th']):
                text = cell.get_text().strip()
                if text and len(text.split()) <= 5:  # Focus on word-list like content
                    table_content.append(text)
        
        return table_content

    def _extract_content(self, soup: BeautifulSoup) -> List[str]:
        """Extract content from HTML structure."""
        content = []
        
        # Remove unwanted elements first
        for element in soup.find_all(self.unwanted_elements):
            element.decompose()
        
        # Extract text from remaining elements
        for element in soup.find_all(string=True):
            if element.parent.name not in self.unwanted_elements:
                text = self.text_cleaner.normalize_text(element.string)
                if text and len(text) >= 2:
                    content.append(text)
        
        return content
    

    def is_too_complex(self, html: str, url: str, config: ContentProcessorConfig) -> bool:
        """Determine if a page is too complex for content extraction."""
        # Check domain against skip list
        domain = get_domain_from_url(url)
        if any(skip in domain for skip in config.skip_domains):
            self.logger.info(f"Skipping content extraction for blocked domain: {domain}")
            return True
            
        # Quick check for single-page apps and complex UIs
        if '<div id="app"' in html or '<div id="root"' in html:
            # Count script tags as complexity indicator
            script_count = html.count('<script')
            if script_count > config.max_js_scripts:
                self.logger.info(f"Skipping complex JS app with {script_count} scripts")
                return True
        
        # Parse with BeautifulSoup for more complex checks
        try:
            soup = BeautifulSoup(html, 'html.parser')
            element_count = len(soup.find_all())
            
            if element_count > config.complex_dom_threshold:
                self.logger.info(f"Skipping complex page with {element_count} elements")
                return True
                
            return False
        except Exception as e:
            self.logger.warning(f"Error checking page complexity: {e}")
            # Be conservative - if we can't check complexity, assume it's manageable
            return False