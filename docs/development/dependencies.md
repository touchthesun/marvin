# spaCy Usage Conventions

## Class Initialization
Any class that requires linguistic analysis must initialize with a spaCy language model:

```python
def __init__(self, nlp: spacy.language.Language, ...):
    """Initialize with spaCy model.
    
    Args:
        nlp: spaCy language model for linguistic analysis
    """
    self.nlp = nlp
```

## Document Creation
Methods that need linguistic analysis must follow these rules:

1. Create spaCy Doc objects at the start of the method:
```python
def analyze_text(self, text: str) -> Dict:
    """Analyze text using linguistic features.
    
    Creates a spaCy Doc for analysis at method start.
    """
    doc = self.nlp(text)
    # Rest of analysis...
```

2. Never store Doc objects as instance variables
3. Create new Doc objects for each distinct text being analyzed
4. Pass Doc objects to helper methods rather than recreating them

## Method Documentation
Methods should clearly document their spaCy usage:

```python
def validate_phrase(self, text: str) -> bool:
    """Validate phrase using linguistic analysis.
    
    Creates a spaCy Doc for linguistic validation.
    
    Args:
        text: Text to validate
        
    Returns:
        bool indicating if phrase is valid
    """
    doc = self.nlp(text)
    return self._check_patterns(doc)
```

```python
def _check_patterns(self, doc: spacy.tokens.Doc) -> bool:
    """Check linguistic patterns in pre-created Doc.
    
    Args:
        doc: spaCy Doc with required annotations
            (requires tokenization and POS tagging)
    """
    return any(token.pos_ == 'NOUN' for token in doc)
```

## Base Classes
Abstract base classes that require spaCy should enforce these conventions:

```python
class LinguisticRule(ABC):
    """Abstract base class for linguistic rules.
    
    All concrete implementations must:
    1. Accept a spacy.tokens.Doc object in their methods
    2. Never create new Doc objects (receive from caller)
    3. Document required linguistic features
    """
    
    @abstractmethod
    def apply(self, text: str, doc: spacy.tokens.Doc) -> bool:
        """Apply linguistic rule.
        
        Args:
            text: Original text
            doc: Pre-created spaCy Doc with required annotations
        """
        pass
```

## Best Practices

1. **Doc Creation**: Always create Doc objects at the highest level needed and pass down
2. **Efficiency**: Avoid creating multiple Doc objects for the same text
3. **Documentation**: Clearly document which linguistic features are required
4. **Type Hints**: Always use proper type hints for spaCy objects
5. **Validation**: Validate that required linguistic features are available

## Example Usage Flow

```python
class KeywordValidator:
    def __init__(self, nlp: spacy.language.Language):
        self.nlp = nlp
        self.rules = [Rule1(), Rule2(), Rule3()]
    
    def validate_keyword(self, text: str) -> bool:
        # Create Doc once at top level
        doc = self.nlp(text)
        
        # Pass to all rules that need it
        return all(rule.is_valid(text, doc) for rule in self.rules)
```