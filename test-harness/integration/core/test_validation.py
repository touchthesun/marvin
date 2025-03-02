import pytest
import spacy
from core.tools.content.validation import KeywordValidator, ValidationConfig, AbbreviationLexicon
from core.tools.content.keywords import TextCleaner, HTMLProcessor

@pytest.fixture(scope="module")
def nlp():
    """Load spaCy model once for all tests"""
    return spacy.load("en_core_web_sm")

@pytest.fixture(scope="module")
def text_cleaner():
    """Create TextCleaner instance"""
    return TextCleaner()

@pytest.fixture(scope="module")
def html_processor(text_cleaner):
    """Create HTMLProcessor instance"""
    return HTMLProcessor(text_cleaner)

@pytest.fixture(scope="module")
def validator(nlp):
    """Create KeywordValidator instance"""
    config = ValidationConfig(max_words=4)
    return KeywordValidator(nlp=nlp, config=config)

def test_valid_keywords(validator):
    """Test validation of valid keywords"""
    valid_cases = [
        "machine learning",
        "artificial intelligence",
        "neural networks",
        "deep learning models",
        "NLP",
        "Python",
        "AWS",
        "United States",
        "data science",
        "GPU processing"
    ]
    
    # Debug the validator object
    print("\nValidator configuration:")
    print(f"Config max_words: {validator.config.max_words}")
    print(f"Number of rules: {len(validator.rules)}")
    print(f"Rule types: {[type(rule).__name__ for rule in validator.rules]}")
    
    # Test first phrase with detailed debugging
    test_phrase = "machine learning"
    doc = validator.nlp(test_phrase)
    
    print(f"\nAnalyzing phrase: {test_phrase}")
    print("Token analysis:")
    for token in doc:
        print(f"Token: {token.text:15} POS: {token.pos_:10} Tag: {token.tag_:10} Dep: {token.dep_:10}")
    
    # Test each rule individually
    print("\nTesting individual rules:")
    for rule in validator.rules:
        is_valid = rule.is_valid(test_phrase, doc)
        print(f"{type(rule).__name__}: {'✓' if is_valid else '✗'}")
    
    # Now run the actual test
    for phrase in valid_cases:
        assert validator.is_valid_phrase(phrase), f"Should accept valid phrase: {phrase}"

def test_invalid_keywords(validator):
    """Test rejection of invalid keywords"""
    invalid_cases = [
        "print(x)",  # code
        "if else while",  # code keywords
        "x = 5",  # assignment
        "how to code",  # question format
        "the and but",  # stop words
        "https://example.com",  # URL
        "very very very very long",  # too many words
        "a",  # too short
        "running quickly",  # verb phrase
        "123 456",  # numbers
        "following steps",  # forbidden start
        ">>> python",  # REPL prompt
        "x + y",  # operators
        "TRUE",  # code literal
        "CONSTANT_VALUE"  # code constant
    ]
    
    for phrase in invalid_cases:
        assert not validator.is_valid_phrase(phrase), f"Should reject invalid phrase: {phrase}"

def test_html_content_extraction(html_processor):
    """Test HTML content cleaning and extraction"""
    html = """
    <html>
        <head><title>Test</title></head>
        <body>
            <nav>Skip this</nav>
            <main>
                <h1>Main Content</h1>
                <p>This is important content.</p>
                <div class="sidebar">Skip this too</div>
            </main>
            <footer>And skip this</footer>
        </body>
    </html>
    """
    
    cleaned = html_processor.clean_html(html)
    assert "Main Content" in cleaned
    assert "This is important content" in cleaned
    assert "Skip this" not in cleaned
    assert "Skip this too" not in cleaned

def test_keyword_relationships(validator, nlp):
    """Test relationship tracking between keywords"""
    text = "Microsoft Corporation and Bill Gates developed Windows. \
           Apple Inc. and Steve Jobs created iOS."
    
    doc = nlp(text)
    
    # Test entity relationships
    relationships = {
        "Microsoft": ["Bill Gates", "Windows"],
        "Apple": ["Steve Jobs", "iOS"]
    }
    
    for company, related in relationships.items():
        for term in related:
            assert validator.is_valid_phrase(company)
            assert validator.is_valid_phrase(term)

def test_code_pattern_rejection(validator):
    """Test rejection of code patterns"""
    code_patterns = [
        "myFunction()",
        "someVar = value",
        "if condition:",
        "print('hello')",
        "x += 1",
        "return true",
        "NULL",
        "undefined",
        "API_KEY",
        "MAX_VALUE"
    ]
    
    for pattern in code_patterns:
        assert not validator.is_valid_phrase(pattern), f"Should reject code pattern: {pattern}"

def test_entity_extraction(validator, nlp):
    """Test named entity validation"""
    text = """
    The United Nations (UN) works globally. 
    NASA explores space. 
    The CEO of Apple Inc. spoke about AI.
    """
    
    valid_entities = ["United Nations", "UN", "NASA", "Apple", "AI"]
    
    for entity in valid_entities:
        assert validator.is_valid_phrase(entity), f"Should accept valid entity: {entity}"

def test_abbreviation_handling(validator):
    """Test handling of valid abbreviations"""
    abbreviations = [
        # Countries
        "US", "UK", "EU", "UAE",
        # Tech
        "AI", "API", "CPU", "GPU",
        # Organizations
        "UN", "WHO", "NASA", "FBI",
        # States
        "NY", "CA", "TX", "FL",
        # Units
        "KB", "MB", "GB", "TB"
    ]
    
    for abbr in abbreviations:
        assert validator.is_valid_phrase(abbr), f"Should accept valid abbreviation: {abbr}"

def test_text_cleaning(text_cleaner):
    """Test text normalization and cleaning"""
    test_cases = [
        ("Click here•Next page", "Click here Next page"),
        ("Login|Signup", "Login Signup"),
        ("FirstWord SecondWord", "First Word Second Word"),
        ("  Multiple   Spaces  ", "Multiple Spaces"),
        ("Share•Facebook•Twitter", "Share Facebook Twitter")
    ]
    
    for input_text, expected in test_cases:
        cleaned = text_cleaner.normalize_text(input_text)
        assert cleaned == expected, f"Text cleaning failed for: {input_text}"

def test_ui_text_detection(text_cleaner):
    """Test UI text pattern detection"""
    ui_texts = [
        "Click here to continue",
        "Login to your account",
        "Menu navigation",
        "Next page",
        "Loading please wait"
    ]
    
    for text in ui_texts:
        assert text_cleaner.is_ui_text(text), f"Should detect UI text: {text}"

def test_substantial_text(text_cleaner):
    """Test substantial text detection"""
    cases = [
        ("This is a substantial piece of text that should be processed", True),
        ("Click here", False),
        ("A very short text", False),
        ("Navigation menu", False),
        ("This article discusses important concepts in detail", True)
    ]
    
    for text, expected in cases:
        result = text_cleaner.is_substantial_text(text)
        assert result == expected, f"Substantial text detection failed for: {text}"

def test_abbreviation_lexicon():
    """Test abbreviation lexicon functionality"""
    lexicon = AbbreviationLexicon()
    
    # Test country codes
    country_codes = lexicon.get_country_codes()
    assert "us" in country_codes
    assert "gb" in country_codes
    assert "uk" in country_codes
    
    # Test state codes
    state_codes = lexicon.get_us_state_codes()
    assert "ca" in state_codes
    assert "ny" in state_codes
    
    # Test tech abbreviations
    tech_abbrevs = lexicon.get_tech_abbreviations()
    assert "api" in tech_abbrevs
    assert "cpu" in tech_abbrevs
    
    # Test combined abbreviations
    all_abbrevs = lexicon.get_all_abbreviations()
    assert len(all_abbrevs) > 100  # Should have a substantial number
    assert "usa" in all_abbrevs
    assert "api" in all_abbrevs
    assert "ca" in all_abbrevs

def test_validation_config():
    """Test validation configuration"""
    # Test default config
    default_config = ValidationConfig()
    assert default_config.max_words == 3
    assert len(default_config.allowed_short_terms) > 0
    assert len(default_config.forbidden_starts) > 0
    
    # Test custom config
    custom_config = ValidationConfig(
        max_words=5,
        forbidden_starts={'custom', 'words'}
    )
    assert custom_config.max_words == 5
    assert 'custom' in custom_config.forbidden_starts
    
    # Test abbreviation integration
    assert 'api' in custom_config.allowed_short_terms
    assert 'usa' in custom_config.allowed_short_terms

def test_complex_validation_scenarios(validator):
    """Test more complex validation scenarios"""
    complex_cases = [
        ("deep neural networks", True),
        ("machine learning algorithms", True),
        ("artificial intelligence systems", True),
        ("click here to download", False),
        ("python programming language", True),
        ("loading please wait", False),
        ("ERROR_MESSAGE_CONSTANT", False),
        ("database.query()", False),
        ("United States of America", True),
        ("how to implement API", False)
    ]
    
    # Debug the problematic case
    test_phrase = "United States of America"
    doc = validator.nlp(test_phrase)
    print(f"\nAnalyzing phrase: {test_phrase}")
    print("Token analysis:")
    for token in doc:
        print(f"Token: {token.text:15} POS: {token.pos_:10} Tag: {token.tag_:10} Dep: {token.dep_:10}")

    # Test each rule individually for this phrase
    print("\nTesting individual rules:")
    for rule in validator.rules:
        is_valid = rule.is_valid(test_phrase, doc)
        print(f"{type(rule).__name__}: {'✓' if is_valid else '✗'}")

    # Run the actual test cases
    for phrase, expected in complex_cases:
        result = validator.is_valid_phrase(phrase)
        assert result == expected, f"Complex validation failed for: {phrase}"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])