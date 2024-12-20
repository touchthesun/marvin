from readability import Document
from bs4 import BeautifulSoup
import pytest

def test_readability_extraction():
    # Load the problematic document
    with open('tests/benchmarks/pages/The Allopathic Complex and Its Consequences.html', 'r') as f:
        html = f.read()
    
    doc = Document(html)
    content_html = doc.summary()
    
    # Clean the extracted HTML
    soup = BeautifulSoup(content_html, 'html.parser')
    content = soup.get_text()
    title = doc.title()
    
    print("\n")
    print(f"Title length: {len(title)}")
    print(f"Content length: {len(content)}")
    print(f"Title: {title}")
    print("\nFirst 500 chars of content:")
    print("-" * 80)
    print(content[:500].strip())
    print("-" * 80)
    
    # Add some content-specific assertions
    expected_phrases = [
        "allopathic",
        "pain",  # Assuming this is a medical article
        "treatment"
    ]
    
    for phrase in expected_phrases:
        assert phrase in content.lower(), f"Should contain '{phrase}'"
    
    # Check for common unwanted content
    unwanted_phrases = [
        "Subscribe",
        "Share",
        "Comment",
        "Follow us"
    ]
    
    for phrase in unwanted_phrases:
        assert phrase not in content, f"Should not contain '{phrase}'"

    assert len(content) > 1000, f"Content seems too short: {len(content)} chars"