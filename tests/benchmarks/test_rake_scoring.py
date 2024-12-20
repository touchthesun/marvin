import pytest
from dataclasses import dataclass, field
from typing import Dict
import math
import re
from core.tools.content.keywords import KeywordExtractor, TextCleaner, HTMLProcessor

@dataclass
class RakeScoreAnalysis:
    """Stores essential analysis of RAKE scoring"""
    phrase: str
    raw_score: float
    frequency: int
    final_score: float
    word_freqs: Dict[str, int] = field(default_factory=dict)  # Optional word frequencies

class TestRakeScoring:
    """Test class for analyzing RAKE scoring with focus on key concepts"""
    
    def setup_method(self):
        """Setup test fixtures for each method"""
        self.text_cleaner = TextCleaner()
        self.html_processor = HTMLProcessor(self.text_cleaner)
        self.extractor = KeywordExtractor(self.text_cleaner, self.html_processor)
        
        # Load and clean test content
        with open("tests/benchmarks/pages/end_of_an_empire.html", "r") as f:
            html_content = f.read()
        self.test_text = self.html_processor.clean_html(html_content)
    
    def validate_phrase(self, phrase: str) -> bool:
        """Check if phrase represents a key concept"""
        doc = self.extractor.nlp(phrase)
        
        # Must have at least one noun
        if not any(token.pos_ == 'NOUN' for token in doc):
            return False
            
        # Must be either:
        # 1. A single noun
        # 2. Adjective + noun
        # 3. Noun + noun (compound)
        valid_patterns = [
            ['NOUN'],
            ['ADJ', 'NOUN'],
            ['NOUN', 'NOUN'],
            ['ADJ', 'ADJ', 'NOUN'],
            ['ADJ', 'NOUN', 'NOUN']
        ]
        
        pos_sequence = [token.pos_ for token in doc]
        return pos_sequence in valid_patterns
    
    def adjust_score(self, score: float, freq: int) -> float:
        """Simple scoring based mainly on frequency"""
        # Favor phrases that appear multiple times
        return score * math.log(1 + freq)
    
    def get_word_frequencies(self, phrase: str) -> Dict[str, int]:
        """Get frequency of each word in the phrase"""
        return {
            word: self.test_text.lower().count(word.lower())
            for word in phrase.split()
        }
    
    def get_improved_keywords(self) -> Dict[str, RakeScoreAnalysis]:
        """Get keywords focusing on key concepts"""
        improved_keywords = {}
        raw_keywords = self.extractor.rake.get_ranked_phrases_with_scores()
        
        for score, phrase in raw_keywords:
            if self.validate_phrase(phrase):
                freq = len(re.findall(r'\b' + re.escape(phrase.lower()) + r'\b',
                                    self.test_text.lower()))
                if freq > 0:
                    final_score = self.adjust_score(score, freq)
                    
                    analysis = RakeScoreAnalysis(
                        phrase=phrase,
                        raw_score=score,
                        frequency=freq,
                        final_score=final_score,
                        word_freqs=self.get_word_frequencies(phrase)
                    )
                    improved_keywords[phrase] = analysis
        
        return improved_keywords
    
    def test_rake_scoring_analysis(self):
        """Compare original and improved RAKE scoring approaches"""
        original_keywords = self.extractor._extract_rake_keywords(self.test_text)
        improved_keywords = self.get_improved_keywords()
        
        print("\nComparison of Original vs Improved RAKE Scoring:")
        print("=" * 80)
        
        print("\nOriginal Top 15:")
        print("-" * 40)
        for phrase, (score, freq) in sorted(original_keywords.items(), 
                                          key=lambda x: x[1][0], 
                                          reverse=True)[:15]:
            print(f"{phrase:<35} Score: {score:>6.2f} Freq: {freq}")
        
        print("\nImproved Top 15 (with analysis):")
        print("-" * 40)
        sorted_improved = sorted(improved_keywords.items(), 
                               key=lambda x: x[1].final_score, 
                               reverse=True)[:15]
        for phrase, analysis in sorted_improved:
            print(f"\nPhrase: {phrase}")
            print(f"Score: {analysis.final_score:.2f}")
            print(f"Frequency: {analysis.frequency}")
            print("Word frequencies:")
            for word, freq in analysis.word_freqs.items():
                print(f"  {word:15} freq={freq:2d}")

if __name__ == "__main__":
    pytest.main([__file__, "-s"])