import pytest
import logging
import time
from core.utils.logger import get_logger
from pathlib import Path
from typing import List, Tuple, Dict, Callable, Any
from bs4 import BeautifulSoup
from collections import defaultdict
from dataclasses import dataclass
from core.tools.content.keywords import KeywordExtractor, TextCleaner, HTMLProcessor, KeywordResult
from readability import Document





@pytest.fixture(autouse=True, scope="session")
def configure_logging():
    """Configure logging for all tests"""
    loggers = [
        logging.getLogger("core.tools.content.keywords"),
        logging.getLogger("test_keyword_extraction"),
        logging.getLogger("core.utils.logger")
    ]
    
    # Store original levels
    original_levels = {logger: logger.level for logger in loggers}
    
    # Set all to WARNING for tests
    for logger in loggers:
        logger.setLevel(logging.INFO)
    
    yield
    
    # Restore original levels
    for logger, level in original_levels.items():
        logger.setLevel(level)

@dataclass
class BenchmarkResult:
    """Stores results for a single benchmark page"""
    filename: str
    file_path: Path
    keywords: List[Tuple[str, float, int]]  # (keyword, score, frequency)
    extracted_text: str
    processing_time: float = 0.0

    def __repr__(self) -> str:
        """Pretty formatted representation excluding extracted_text"""
        keywords_fmt = '\n      '.join(
            f"{kw:<35} (score: {score:>6.2f}, freq: {freq:>2})"
            for kw, score, freq in self.keywords
        )
        
        return (
            f"\nBenchmarkResult for: {self.filename}\n"
            f"  Processing time: {self.processing_time:.3f}s\n"
            f"  Keywords:\n"
            f"      {keywords_fmt}\n"
        )

@dataclass
class QualityMetrics:
    """Stores quality metrics for keyword extraction"""
    avg_keywords_per_page: float
    avg_keyword_length: float
    avg_score: float
    keyword_types: Dict[str, int]
    
    def __str__(self) -> str:
        return (
            f"\nQuality Metrics:"
            f"\n  Average keywords per page: {self.avg_keywords_per_page:.2f}"
            f"\n  Average keyword length: {self.avg_keyword_length:.2f}"
            f"\n  Average keyword score: {self.avg_score:.2f}"
            f"\n  Keyword types:"
            f"\n    " + "\n    ".join(f"{k}: {v}" for k, v in self.keyword_types.items())
        )



# Test Data
TECHNICAL_HTML = """
<div class="content">
    <h1>Getting Started with Python</h1>
    <p>Python programming language is widely used in machine learning and data science.
    The Python ecosystem includes many libraries for scientific computing.</p>
    <div class="nav">Skip this navigation</div>
</div>
"""

RECIPE_HTML = """
<article>
    <h1>Classic Chocolate Cake Recipe</h1>
    <p>This chocolate cake recipe is perfect for beginners. The cake mixture 
    combines cocoa powder and butter for a rich texture.</p>
    <div class="social-share">Share this recipe</div>
</article>
"""

NEWS_HTML = """
<main>
    <h1>Local Community Center Opens</h1>
    <p>The new community center will provide various services to residents.
    The center features a library and meeting spaces for local groups.</p>
    <div class="comments">Comments section</div>
</main>
"""

@pytest.fixture
def text_cleaner():
    return TextCleaner()

@pytest.fixture
def html_processor(text_cleaner):
    return HTMLProcessor(text_cleaner)


@pytest.fixture
def keyword_extractor(text_cleaner, html_processor):
    return KeywordExtractor(
        text_cleaner=text_cleaner,
        html_processor=html_processor,
        min_chars=3,
        max_words=4
    )

@dataclass
class ExtractionResult:
    """Stores results from a single keyword extraction run"""
    method: str
    keywords: List[str]
    scores: List[float]
    processing_time: float
    document_size: int
    error: str = None


class TestTextCleaner:
    def test_normalize_text(self, text_cleaner):
        test_text = "This   has\nmultiple\tspaces  and\nlines • test › next"
        normalized = text_cleaner.normalize_text(test_text)
        assert "   " not in normalized
        assert "\n" not in normalized
        assert "\t" not in normalized
        assert "•" not in normalized
        assert "›" not in normalized
        assert normalized == "This has multiple spaces and lines test next"
    
    def test_is_ui_text(self, text_cleaner):
        ui_texts = [
            "Click here to continue",
            "Select your language",
            "Menu navigation",
            "Next page",
            "Loading...",
            "English • Español • Français",
        ]
        for text in ui_texts:
            assert text_cleaner.is_ui_text(text), f"Should detect UI text: {text}"
    
    def test_not_ui_text(self, text_cleaner):
        content_texts = [
            "Python is a programming language",
            "The recipe requires three eggs",
            "Community center opens tomorrow",
        ]
        for text in content_texts:
            assert not text_cleaner.is_ui_text(text), f"Should not detect UI text: {text}"
    
    def test_is_substantial_text(self, text_cleaner):
        # Test short text
        assert not text_cleaner.is_substantial_text("Short text", min_length=20)
        
        # Test UI text
        assert not text_cleaner.is_substantial_text("Click here to continue reading", min_length=20)
        
        # Test substantial text
        long_text = "This is a substantial piece of text that contains meaningful content"
        assert text_cleaner.is_substantial_text(long_text, min_length=20)

class TestHTMLProcessor:
    def test_clean_html_with_non_html(self, html_processor):
        plain_text = "This is plain text"
        assert html_processor.clean_html(plain_text) == plain_text
    
    def test_remove_unwanted_elements(self, html_processor):
        soup = BeautifulSoup(TECHNICAL_HTML, 'html.parser')
        html_processor._remove_unwanted_elements(soup)
        
        # Should remove navigation
        assert not soup.find('div', class_='nav')
        # Should keep content
        assert soup.find('h1')
        assert soup.find('p')

    
    def test_should_keep_element(self, html_processor):
        soup = BeautifulSoup('<nav class="main-nav"><p>Test</p></nav>', 'html.parser')
        nav = soup.find('nav')
        result = html_processor._should_keep_element(nav)

        test_cases = [
            ('<div id="content"><p>Test</p></div>', True),
            ('<p>Test</p>', True),
            ('<nav class="main-nav"><p>Test</p></nav>', False),
            ('<footer class="site-footer">Test</footer>', False),
            ('<script>alert("test")</script>', False),
        ]
        
        for html, expected in test_cases:
            element = BeautifulSoup(html, 'html.parser').find()
            result = html_processor._should_keep_element(element)
            assert result == expected, f"Failed for {element.name}: expected {expected}, got {result}"
    
    def test_extract_content(self, html_processor):
        # Test technical content
        tech_soup = BeautifulSoup(TECHNICAL_HTML, 'html.parser')
        tech_content = html_processor._extract_content(tech_soup)
        assert any('Python' in text for text in tech_content)
        
        # Test recipe content
        recipe_soup = BeautifulSoup(RECIPE_HTML, 'html.parser')
        recipe_content = html_processor._extract_content(recipe_soup)
        assert any('chocolate cake' in text.lower() for text in recipe_content)
        
        # Test news content
        news_soup = BeautifulSoup(NEWS_HTML, 'html.parser')
        news_content = html_processor._extract_content(news_soup)
        assert any('community center' in text.lower() for text in news_content)



class KeywordExtractorUnitTests:
    def test_is_valid_phrase(self, keyword_extractor):
        valid_phrases = [
            "Python",
            "machine learning",
            "data science tools",
            "artificial intelligence research"
        ]
        for phrase in valid_phrases:
            assert keyword_extractor.is_valid_phrase(phrase), f"Should accept: {phrase}"
        
        invalid_phrases = [
            "click here",
            "how to make",
            "what is",
            "loading please wait",
            "https://example.com",
            "very very very long phrase",
            "the",
            "and then",
            "123 numbers",
            "with at by"
        ]
        for phrase in invalid_phrases:
            assert not keyword_extractor.is_valid_phrase(phrase), f"Should reject: {phrase}"
    
    def test_calculate_phrase_score(self, keyword_extractor):
        text = "Machine learning is transforming technology. This guide covers machine learning basics."
        
        # Test single word
        single_score = keyword_extractor.calculate_phrase_score(
            "technology", 1.0, 1, text
        )
        
        # Test two words (should get bonus)
        double_score = keyword_extractor.calculate_phrase_score(
            "machine learning", 1.0, 2, text
        )
        
        # Two-word phrase should score higher due to length bonus
        assert double_score > single_score
        
        # Test position bonus
        early_phrase = "Machine learning"  # Appears at start
        late_phrase = "technology"  # Appears later
        
        early_score = keyword_extractor.calculate_phrase_score(
            early_phrase, 1.0, 1, text
        )
        late_score = keyword_extractor.calculate_phrase_score(
            late_phrase, 1.0, 1, text
        )
        
        # Early phrase should get position bonus
        assert early_score > late_score
    
    def test_extract_keywords(self, keyword_extractor):
        tech_html = """
        <div class="content">
            <h1>Getting Started with Python Programming</h1>
            <p>Python programming language is widely used in machine learning and data science.
            Python offers a rich ecosystem that includes many libraries for scientific computing.
            Many developers choose Python for its simplicity and versatility. Python's package
            manager pip makes it easy to install libraries.</p>
        </div>
        """
        
        # Debug HTML processing steps
        print("\nDebug HTML processing:")
        
        # Test direct HTML cleaning
        cleaned_text = self.clean_html_content(keyword_extractor, tech_html)
        
        # Check content extraction directly
        soup = BeautifulSoup(tech_html, 'html.parser')
        content_sections = keyword_extractor.html_processor._extract_content(soup)
        
        # Try extracting keywords with very low threshold
        keywords = keyword_extractor.extract_keywords(
            tech_html,
            min_score=0.01,  # Extremely low threshold
            max_keywords=50   # Allow many keywords
        )
        
        print(f"\nExtracted keywords: {[kw.keyword for kw in keywords]}")
        print(f"Number of keywords: {len(keywords)}")
        
        assert len(content_sections) > 0, "Should extract at least one content section"
        assert len(cleaned_text) > 100, "Should have substantial cleaned text"
        assert len(keywords) > 0, "Should extract at least one keyword"
    
    @pytest.mark.parametrize("max_keywords", [5, 10, 20])
    def test_keyword_limits(self, keyword_extractor, max_keywords):
        """Test different limits on keyword count"""
        keywords = keyword_extractor.extract_keywords(
            TECHNICAL_HTML, 
            max_keywords=max_keywords,
            min_score=1.0
        )
        assert len(keywords) <= max_keywords
    
    def test_empty_or_invalid_input(self, keyword_extractor):
        # Test empty string
        assert keyword_extractor.extract_keywords("") == []
        
        # Test very short text
        assert keyword_extractor.extract_keywords("Too short") == []
        
        # Test UI-only text
        ui_text = """
        <div class="nav">
            <button>Click here</button>
            <button>Next page</button>
        </div>
        """
        assert keyword_extractor.extract_keywords(ui_text) == []

    def test_extract_tfidf_keywords(self, keyword_extractor):
        """Test TF-IDF keyword extraction"""
        text = """Machine learning is transforming technology. 
                 This guide covers machine learning basics and artificial intelligence.
                 Deep learning and neural networks are important concepts."""
        
        tfidf_keywords = keyword_extractor._extract_tfidf_keywords(text)
        
        assert len(tfidf_keywords) > 0, "Should extract TF-IDF keywords"
        assert any('machine learning' in kw.lower() for kw in tfidf_keywords.keys())
        
        # Check structure of results
        for keyword, (score, freq) in tfidf_keywords.items():
            assert isinstance(score, float)
            assert isinstance(freq, int)
            assert score > 0
            assert freq > 0
    
    def test_extract_named_entities(self, keyword_extractor):
        """Test named entity extraction"""
        text = """Microsoft CEO Satya Nadella discussed Azure and OpenAI 
                 during his visit to New York last week."""
        
        entity_keywords = keyword_extractor._extract_named_entities(text)
        
        assert len(entity_keywords) > 0, "Should extract named entities"
        assert any(entity in kw for kw in entity_keywords.keys() 
                  for entity in ['Microsoft', 'Satya Nadella', 'Azure', 'OpenAI', 'New York'])
        
        # Check structure of results
        for keyword, (score, freq) in entity_keywords.items():
            assert isinstance(score, float)
            assert isinstance(freq, int)
            assert score > 0
            assert freq > 0
    
    def test_filter_similar_keywords(self, keyword_extractor):
        """Test filtering of similar keywords"""
        keywords = [
            KeywordResult("machine learning", 1.0, 2, 2, "rake", "phrase"),
            KeywordResult("learning machines", 0.8, 1, 2, "rake", "phrase"),
            KeywordResult("artificial intelligence", 0.9, 2, 2, "rake", "phrase"),
            KeywordResult("AI", 0.7, 3, 1, "entity", "ORG")
        ]
        
        filtered = keyword_extractor._filter_similar_keywords(keywords)
        assert len(filtered) < len(keywords), "Should remove similar keywords"
        
        # Check that highest scoring variants are kept
        scores = {kw.keyword: kw.score for kw in filtered}
        if "machine learning" in scores and "learning machines" in scores:
            assert scores["machine learning"] > scores["learning machines"]
    
    def test_hybrid_extraction(self, keyword_extractor):
        """Test the complete hybrid extraction pipeline"""
        text = """OpenAI's ChatGPT uses advanced machine learning techniques.
                The artificial intelligence model, developed in San Francisco,
                has transformed natural language processing."""
        
        keywords = keyword_extractor.extract_keywords_hybrid(text)
        
        assert len(keywords) > 0, "Should extract keywords"
        
        # Check we get different types of keywords
        sources = {kw.source for kw in keywords}
        assert len(sources) > 1, "Should have keywords from multiple sources"
        
        # Check for specific expected phrases
        all_keywords = {kw.keyword.lower() for kw in keywords}
        expected_phrases = {'openai', 'chatgpt', 'machine learning', 'artificial intelligence', 
                        'san francisco', 'natural language processing'}
        found_phrases = expected_phrases.intersection(all_keywords)
        assert len(found_phrases) >= 2, f"Should find at least 2 key phrases. Found: {found_phrases}"

class KeywordExtractionTestBase:
    """Base class for keyword extraction tests"""
    
    @pytest.fixture(scope="class")
    def benchmark_runner(self):
        benchmark_dir = Path(__file__).parent / 'pages'
        return BenchmarkRunner(benchmark_dir)
    
    def clean_html_content(self, keyword_extractor: Any, content: str) -> str:
        """Clean HTML content before keyword extraction"""
        return keyword_extractor.html_processor.clean_html(content)
    
    def create_extraction_fn(self, 
                        keyword_extractor: Any,
                        extraction_method: Callable,
                        min_score: float = 1.0,
                        max_keywords: int = 15) -> Callable:
        """Creates a complete extraction function including filtering"""

        def extraction_fn(text: str):
            cleaned_text = self.clean_html_content(keyword_extractor, text)
            raw_keywords = extraction_method(cleaned_text)
            print(f"\nRaw keywords found: {len(raw_keywords)}")
            
            # Add more detailed debugging for TF-IDF
            if extraction_method == keyword_extractor._extract_tfidf_keywords:
                print("\nTF-IDF Debug:")
                top_scores = sorted([(k, s, f) for k, (s, f) in raw_keywords.items()], 
                                key=lambda x: x[1], 
                                reverse=True)[:5]
                print("Top 5 raw keywords:")
                for keyword, score, freq in top_scores:
                    print(f"  {keyword}: score={score}, freq={freq}")
                
                print("\nFiltering stats:")
                print(f"Valid phrases: {sum(1 for k in raw_keywords if keyword_extractor.is_valid_phrase(k))}")
                print(f"Above score threshold: {sum(1 for _, (s, _) in raw_keywords.items() if s >= min_score)}")
            
            filtered = self.filter_keywords(
                extractor=keyword_extractor,
                raw_keywords=raw_keywords,
                min_score=min_score,
                max_keywords=max_keywords
            )
            print(f"Keywords after filtering: {len(filtered)}")
            return filtered
        return extraction_fn
    
    def create_hybrid_extraction_fn(self,
                                  keyword_extractor: Any,
                                  max_keywords: int = 15) -> Callable:
        """Creates a hybrid extraction function"""
        def extraction_fn(text: str):
            raw_keywords = keyword_extractor.extract_keywords_hybrid(text)
            return self.filter_hybrid_keywords(
                extractor=keyword_extractor,
                keywords=raw_keywords,
                max_keywords=max_keywords
            )
        return extraction_fn
    

    def filter_keywords(self, 
                       extractor: Any,
                       raw_keywords: Dict[str, Tuple[float, int]],
                       min_score: float = 1.0,
                       max_keywords: int = 15) -> Dict[str, Tuple[float, int]]:
        """Filter keyword results using common criteria"""
        filtered_keywords = {}
        
        # First pass: Apply validity and score filters
        for phrase, (score, freq) in raw_keywords.items():
            if (extractor.is_valid_phrase(phrase) and score >= min_score):
                filtered_keywords[phrase] = (score, freq)
        
        # Second pass: Limit to top N keywords
        sorted_items = sorted(filtered_keywords.items(), 
                            key=lambda x: x[1][0],  # Sort by score
                            reverse=True)[:max_keywords]
        
        return dict(sorted_items)
    

    def filter_hybrid_keywords(self,
                             extractor: Any,
                             keywords: List[Any],
                             max_keywords: int = 15) -> List[Any]:
        """Filter hybrid keyword results"""
        filtered = [kw for kw in keywords 
                   if extractor.is_valid_phrase(kw.keyword)]
        filtered.sort(key=lambda x: x.score, reverse=True)
        return filtered[:max_keywords]
    

    def validate_results(self, results: List[ExtractionResult]):
        """Common validation for extraction results"""
        for result in results:
            if result.error:
                pytest.fail(f"Error in {result.method}: {result.error}")
        
        # Ensure at least 75% of files produced keywords
        files_with_keywords = sum(1 for result in results if len(result.keywords) > 0)
        success_rate = files_with_keywords / len(results)
        assert success_rate >= 0.75, (
            f"Too many files without keywords. Success rate: {success_rate:.2%}"
        )
        
        # Validate other aspects for files that did produce keywords
        for result in results:
            if len(result.keywords) > 0:
                assert len(result.keywords) == len(result.scores), "Mismatched keywords and scores"
                assert result.processing_time > 0, "Invalid processing time"
                assert len(result.keywords) <= 15, "Too many keywords returned"


    def test_hybrid_relationship_tracking(self, keyword_extractor):
        """Test that hybrid extraction properly tracks relationships between terms"""
        test_text = """
        Microsoft CEO Satya Nadella discussed the future of artificial intelligence.
        The Microsoft AI division is working on large language models.
        These AI models use machine learning techniques.
        """
        
        keywords = keyword_extractor.extract_keywords_hybrid(test_text)
        
        # Find keyword results by type
        entities = [kw for kw in keywords if kw.keyword_type == 'entity']
        
        # Verify entity relationships
        microsoft_kw = next(kw for kw in entities if kw.keyword == 'Microsoft')
        
        assert 'Satya Nadella' in microsoft_kw.related_terms
        assert 'AI' in microsoft_kw.related_terms

    def test_hybrid_type_prioritization(self, keyword_extractor):
        """Test that keywords are properly prioritized by type"""
        test_text = """
        Google and Microsoft are competing in the AI space.
        Artificial intelligence technology is advancing rapidly.
        Tech companies are investing heavily in AI research.
        """
        
        keywords = keyword_extractor.extract_keywords_hybrid(test_text)
        
        # First few results should be entities
        assert keywords[0].keyword_type == 'entity'
        assert keywords[1].keyword_type == 'entity'
        
        # Check ordering within same type
        entities = [kw for kw in keywords if kw.keyword_type == 'entity']
        assert entities[0].score >= entities[1].score, "Entities should be ordered by score"
        
        # Verify overall type ordering
        type_order = [kw.keyword_type for kw in keywords]
        assert type_order.index('entity') < type_order.index('concept'), \
            "Entities should come before concepts"
        assert type_order.index('concept') < type_order.index('term'), \
            "Concepts should come before terms"


    def test_hybrid_score_weighting(self, keyword_extractor):
        """Test that different types of keywords are weighted appropriately"""
        test_text = """
        OpenAI's GPT model represents a major breakthrough in AI technology.
        The artificial intelligence model uses advanced neural networks.
        OpenAI researchers published their findings about the GPT architecture.
        """
        
        keywords = keyword_extractor.extract_keywords_hybrid(test_text)
        
        # Entity scores should be boosted
        entity_scores = [kw.score for kw in keywords if kw.keyword_type == 'entity']
        concept_scores = [kw.score for kw in keywords if kw.keyword_type == 'concept']
        term_scores = [kw.score for kw in keywords if kw.keyword_type == 'term']
        
        if entity_scores and concept_scores:
            assert max(entity_scores) > max(concept_scores), \
                "Entities should have boosted scores"
        
        if concept_scores and term_scores:
            assert max(concept_scores) > max(term_scores), \
                "Concepts should score higher than single terms"

    



class TestGeneralBenchmarks(KeywordExtractionTestBase):
    """Tests for comprehensive keyword extraction benchmarking"""
    
    def test_comprehensive_benchmark(self, keyword_extractor, benchmark_runner):
        test_files = benchmark_runner.load_test_files()
        results_dict = {}  # Change to dict to match type hints
        
        extraction_fn = self.create_extraction_fn(
            keyword_extractor=keyword_extractor,
            extraction_method=lambda text: {  # Wrap to return dict format
                kw.keyword: (kw.score, kw.frequency) 
                for kw in keyword_extractor.extract_keywords(text)
            },
            min_score=0.1,
            max_keywords=15
        )
        
        for file_path in test_files:
            print(f"\nProcessing: {file_path.name}")
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            result = benchmark_runner.run_single_extraction(
                extractor_fn=extraction_fn,
                method_name="Comprehensive",
                content=content
            )
            
            cleaned_text = self.clean_html_content(keyword_extractor, content)
            
            # Store in dict with filename as key
            results_dict[file_path.name] = BenchmarkResult(
                filename=file_path.name,
                file_path=file_path,
                keywords=[(kw, score, 1) for kw, score in zip(result.keywords, result.scores)],
                extracted_text=cleaned_text,
                processing_time=result.processing_time
            )
        
        metrics = self._analyze_benchmark_quality(results_dict)
        print(f"\n{metrics}")
        
        self._run_benchmark_quality_checks(results_dict)
        
        return results_dict
    
    def _analyze_benchmark_quality(self, results: Dict[str, BenchmarkResult]) -> QualityMetrics:
        """Analyze the quality of extracted keywords"""
        metrics = {
            'avg_keywords_per_page': [],
            'avg_keyword_length': [],
            'avg_scores': [],
            'keyword_types': defaultdict(int)
        }
        
        for result in results.values():
            keywords = result.keywords
            
            # Count metrics
            metrics['avg_keywords_per_page'].append(len(keywords))
            metrics['avg_keyword_length'].extend([len(kw.split()) for kw, _, _ in keywords])
            metrics['avg_scores'].extend([score for _, score, _ in keywords])
            
            # Analyze patterns
            for keyword, _, _ in keywords:
                # Count word types
                if keyword.lower() in {'the', 'and', 'or', 'but', 'if'}:
                    metrics['keyword_types']['stop_words'] += 1
                elif any(char.isdigit() for char in keyword):
                    metrics['keyword_types']['contains_numbers'] += 1
                elif len(keyword.split()) > 1:
                    metrics['keyword_types']['phrases'] += 1
                else:
                    metrics['keyword_types']['single_words'] += 1
        
        return QualityMetrics(
            avg_keywords_per_page=sum(metrics['avg_keywords_per_page']) / len(metrics['avg_keywords_per_page']) if metrics['avg_keywords_per_page'] else 0,
            avg_keyword_length=sum(metrics['avg_keyword_length']) / len(metrics['avg_keyword_length']) if metrics['avg_keyword_length'] else 0,
            avg_score=sum(metrics['avg_scores']) / len(metrics['avg_scores']) if metrics['avg_scores'] else 0,
            keyword_types=dict(metrics['keyword_types'])
        )
    
    def _run_benchmark_quality_checks(self, results: Dict[str, BenchmarkResult]):
        """Run quality checks on benchmark results"""
        for result in results.values():
            assert len(result.keywords) > 0, f"No keywords found for {result.filename}"
            
            for keyword, score, freq in result.keywords:
                # Keywords shouldn't be too short
                assert len(keyword) >= 3, f"Keyword too short in {result.filename}: {keyword}"
                # Keywords shouldn't be too long
                assert len(keyword.split()) <= 4, f"Keyword too long in {result.filename}: {keyword}"
                # Score should be reasonable
                assert score > 0, f"Zero score for '{keyword}' in {result.filename}"
                # Keyword should appear in text
                assert keyword.lower() in result.extracted_text.lower(), \
                    f"Keyword '{keyword}' not found in text of {result.filename}"



class BenchmarkRunner:
    """Handles loading and running benchmark tests"""
    
    def __init__(self, benchmark_dir: Path):
        self.benchmark_dir = benchmark_dir
        self.logger = get_logger(__name__)
        self.logger.setLevel(logging.WARNING)
        self.results: List[ExtractionResult] = []
    
    def load_test_files(self) -> List[Path]:
        """Load all HTML test files"""
        test_files = list(self.benchmark_dir.glob('**/*.html'))
        self.logger.info(f"Found {len(test_files)} test files")
        return test_files
    
    def run_single_extraction(self, 
                            extractor_fn: Callable, 
                            method_name: str,
                            content: str) -> ExtractionResult:
        """Run a single extraction method with timing"""
        try:
            # Start timing before the extraction
            start_time = time.perf_counter()  # Use perf_counter for more precise timing
            
            # Run extraction
            extraction_result = extractor_fn(content)
            
            # End timing after extraction completes
            processing_time = time.perf_counter() - start_time
            
            # Handle dictionary results from individual extractors
            if isinstance(extraction_result, dict):
                keywords = list(extraction_result.keys())
                scores = [score for score, _ in extraction_result.values()]
            # Handle KeywordResult objects from hybrid extraction
            else:
                keywords = [k.keyword for k in extraction_result]
                scores = [k.score for k in extraction_result]
            
            return ExtractionResult(
                method=method_name,
                keywords=keywords,
                scores=scores,
                processing_time=processing_time,
                document_size=len(content)
            )
        except Exception as e:
            self.logger.error(f"Error in {method_name}", exc_info=True)
            return ExtractionResult(
                method=method_name,
                keywords=[],
                scores=[],
                processing_time=0,
                document_size=len(content),
                error=str(e)
            )


class TestRAKEExtraction(KeywordExtractionTestBase):
    """Tests for RAKE keyword extraction"""
    
    def test_rake_extraction(self, keyword_extractor, benchmark_runner):
        test_files = benchmark_runner.load_test_files()
        results = []
        
        extraction_fn = self.create_extraction_fn(
            keyword_extractor=keyword_extractor,
            extraction_method=keyword_extractor._extract_rake_keywords
        )
        
        for file_path in test_files:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            result = benchmark_runner.run_single_extraction(
                extractor_fn=extraction_fn,
                method_name="RAKE",
                content=content
            )
            results.append(result)
        
        self.validate_results(results)
        return results

class TestTFIDFExtraction(KeywordExtractionTestBase):
    """Tests for TF-IDF keyword extraction"""
    
    def test_tfidf_extraction(self, keyword_extractor, benchmark_runner):
        test_files = benchmark_runner.load_test_files()
        results = []
        
        extraction_fn = self.create_extraction_fn(
            keyword_extractor=keyword_extractor,
            extraction_method=keyword_extractor._extract_tfidf_keywords,
            min_score=0.05
        )
        
        for file_path in test_files:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            result = benchmark_runner.run_single_extraction(
                extractor_fn=extraction_fn,
                method_name="TF-IDF",
                content=content
            )
            results.append(result)
        
        self.validate_results(results)
        return results


class TestNERExtraction(KeywordExtractionTestBase):
    """Tests for Named Entity Recognition extraction"""
    
    def test_ner_extraction(self, keyword_extractor, benchmark_runner):
        test_files = benchmark_runner.load_test_files()
        results = []
        
        extraction_fn = self.create_extraction_fn(
            keyword_extractor=keyword_extractor,
            extraction_method=keyword_extractor._extract_named_entities,
            min_score=0.5  # Lower threshold for NER as they're usually important
        )
        
        for file_path in test_files:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            result = benchmark_runner.run_single_extraction(
                extractor_fn=extraction_fn,
                method_name="NER",
                content=content
            )
            results.append(result)
        
        self.validate_results(results)
        return results

class TestHybridExtraction(KeywordExtractionTestBase):
    """Tests for hybrid keyword extraction"""
    
    def filter_hybrid_keywords(self,
                             extractor: Any,
                             keywords: List[Any],
                             max_keywords: int = 15) -> List[Any]:
        """Filter hybrid keyword results"""
        # First filter invalid phrases
        filtered = [kw for kw in keywords 
                   if extractor.is_valid_phrase(kw.keyword)]
        
        # Sort by score and limit
        filtered.sort(key=lambda x: x.score, reverse=True)
        return filtered[:max_keywords]
    

    def test_hybrid_extraction(self, keyword_extractor):
        """Test the complete hybrid extraction pipeline"""
        text = """
        OpenAI's ChatGPT uses advanced machine learning techniques.
        The artificial intelligence model, developed in San Francisco,
        has transformed natural language processing.
        OpenAI researchers continue to improve the model's capabilities.
        """
        
        keywords = keyword_extractor.extract_keywords_hybrid(text)
        
        # Basic checks
        assert len(keywords) > 0, "Should extract keywords"
        assert all(hasattr(kw, 'related_terms') for kw in keywords), \
            "All keywords should track relationships"
        
        # Check type distribution
        keyword_types = {kw.keyword_type for kw in keywords}
        assert 'entity' in keyword_types, "Should identify entities"
        assert 'concept' in keyword_types, "Should identify concepts"
        
        # Check for expected phrases
        all_keywords = {kw.keyword.lower() for kw in keywords}
        expected_phrases = {
            'openai', 'chatgpt', 'machine learning',
            'artificial intelligence', 'san francisco',
            'natural language processing'
        }
        found_phrases = expected_phrases.intersection(all_keywords)
        assert len(found_phrases) >= 3, \
            f"Should find key phrases. Found: {found_phrases}"
    
    
    def _validate_hybrid_results(self, results: List[ExtractionResult]):
        """Additional validations specific to hybrid extraction"""
        for result in results:
            # Ensure we have results
            assert len(result.keywords) > 0, "No keywords found in hybrid extraction"
            
            # Check keyword quality
            for keyword in result.keywords:
                # No very short keywords
                assert len(keyword) >= 3, f"Keyword too short: {keyword}"
                
                # No keywords with special characters
                assert not any(char in keyword for char in {'<', '>', '/', '#'}), \
                    f"Invalid characters in keyword: {keyword}"
                
                # No pure numbers
                assert not keyword.replace('.', '').isdigit(), \
                    f"Pure numeric keyword found: {keyword}"
                
                # No typical HTML/CSS terms
                css_terms = {'div', 'span', 'class', 'style', 'px', 'rgb', 'rgba'}
                assert not any(term in keyword.lower().split() for term in css_terms), \
                    f"HTML/CSS term found in keyword: {keyword}"
                

def test_html_processor_with_readability(html_processor):
    """Test HTML processing with readability integration"""
    # Test with known complex document
    with open('tests/benchmarks/pages/The Allopathic Complex and Its Consequences.html', 'r') as f:
        html = f.read()
    
    cleaned_text = html_processor.clean_html(html)
    
    print("\n")  # Add blank line for readability
    print(f"Content length: {len(cleaned_text)}")
    print("\nFirst 500 chars of content:")
    print("-" * 80)
    print(cleaned_text[:500])
    print("-" * 80)
    
    assert len(cleaned_text) > 1000, "Should extract substantial content"
    assert "allopathic" in cleaned_text.lower(), "Should contain key terms"
    
    # Verify we're getting clean text
    assert "<html>" not in cleaned_text, "Should not contain HTML tags"
    assert "Subscribe" not in cleaned_text, "Should not contain UI elements"

if __name__ == '__main__':
    pytest.main(['-v', __file__])