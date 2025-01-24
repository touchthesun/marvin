from dataclasses import dataclass, field
from typing import Set, Dict, Any, Optional
import hashlib
from datetime import datetime
from .types import KeywordType
 
@dataclass
class KeywordIdentifier:
    """Identifies and tracks a keyword and its variations.
    
    Attributes:
        text: Original form of the keyword as extracted
        canonical_text: Best/preferred form of the keyword
        normalized_text: Form used for matching/lookup
        variants: Set of known textual variations
        keyword_type: Type classification of the keyword
        id: Stable Neo4j identifier
        metadata: Additional keyword information
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """
    # Required fields first
    text: str
    canonical_text: str
    normalized_text: str
    keyword_type: KeywordType
    
    # Optional fields with defaults after required fields
    score: float = 0.5
    variants: Set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    id: str = field(init=False)  # Generated field, not part of init

    def __post_init__(self):
        """Generate stable ID and initialize variants."""
        # Add original and canonical forms to variants
        self.variants.add(self.text)
        self.variants.add(self.canonical_text)
        
        # Generate stable ID from canonical form and type
        self.id = self._generate_id()

    def _generate_id(self) -> str:
        """Generate a stable ID for Neo4j.
        
        Uses canonical form and type to ensure stability across variations.
        """
        # Combine canonical form and type for stable ID generation
        id_base = f"{self.canonical_text}:{self.keyword_type.value}"
        # Generate SHA-256 hash and take first 16 characters
        hash_obj = hashlib.sha256(id_base.encode('utf-8'))
        return f"kw_{hash_obj.hexdigest()[:16]}"
    
    def add_variant(self, variant: str) -> None:
        """Add a new textual variant.
        
        Args:
            variant: New text form to add
        """
        self.variants.add(variant)
        self.updated_at = datetime.now()
    
    def matches(self, text: str) -> bool:
        """Check if text matches any known variant.
        
        Args:
            text: Text to check
            
        Returns:
            True if text matches any variant, False otherwise
        """
        return text in self.variants
    
    def update_canonical(self, new_canonical: str) -> None:
        """Update the canonical form.
        
        Args:
            new_canonical: New canonical form to use
        """
        self.canonical_text = new_canonical
        self.variants.add(new_canonical)
        self.updated_at = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format for storage/serialization."""
        return {
            "id": self.id,
            "text": self.text,
            "canonical_text": self.canonical_text,
            "normalized_text": self.normalized_text,
            "variants": list(self.variants),
            "keyword_type": self.keyword_type.value,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }


class KeywordNormalizer:
    """Handles keyword text normalization.
    
    This initial implementation provides basic normalization.
    Future versions will support more sophisticated rules.
    """
    
    def normalize(self, text: str) -> str:
        """Normalize text for matching/comparison.
        
        Args:
            text: Text to normalize
            
        Returns:
            Normalized form of text
        """
        # Basic normalization: lowercase and whitespace cleanup
        return " ".join(text.lower().split())
    
    def canonicalize(self, text: str, keyword_type: KeywordType) -> str:
        """Determine canonical form of text.
        
        Args:
            text: Text to canonicalize
            keyword_type: Type of keyword
            
        Returns:
            Canonical form of text
        """
        # Strip and lowercase for comparison
        normalized = text.lower().strip()
        
        # Common suffix transformations
        suffixes = {
            'ian': '',  # american -> america
            'ish': '',  # british -> britain
            'ese': '',  # japanese -> japan
            'ic': '',   # historic -> history
            'al': ''    # historical -> history
        }
        
        for suffix, replacement in suffixes.items():
            if normalized.endswith(suffix):
                return normalized[:-len(suffix)] + replacement
                
        return text.strip()


class VariantManager:
    """Manages keyword variants and canonical forms.
    
    This initial implementation provides basic variant handling.
    Future versions will support more sophisticated matching.
    """
    
    def add_variant(self, keyword_id: str, variant: str) -> None:
        """Add a new textual variant for a keyword.
        
        Args:
            keyword_id: ID of keyword to add variant to
            variant: New variant to add
        """
        # Phase 1: Basic variant storage
        # To be implemented with storage backend
        pass
    
    def is_variant(self, text1: str, text2: str) -> bool:
        """Check if two text forms are variants of same concept.
        
        Args:
            text1: First text to compare
            text2: Second text to compare
            
        Returns:
            True if texts are variants, False otherwise
        """
        norm1 = text1.lower()
        norm2 = text2.lower()
        
        # Direct match
        if norm1 == norm2:
            return True
            
        # One is contained in the other
        if norm1 in norm2 or norm2 in norm1:
            # Check length difference to avoid false positives
            len_diff = abs(len(norm1) - len(norm2))
            if len_diff <= 3:  # Small length difference suggests variant
                return True
                
        return False
    
    def get_canonical_form(self, variants: Set[str]) -> Optional[str]:
        """Choose best canonical form from variants.
        
        Args:
            variants: Set of variant forms
            
        Returns:
            Best canonical form, or None if no variants
        """
        if not variants:
            return None
            
        # Phase 1: Choose longest variant as canonical
        return max(variants, key=len)