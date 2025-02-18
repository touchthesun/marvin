from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
from collections import defaultdict

from ..types import KeywordType, RelationType
from core.utils.logger import get_logger


@dataclass
class RelationshipEvidence:
    """Evidence supporting a relationship between two keywords.
    
    Attributes:
        sentence_text: The full text containing both keywords
        sentence_id: Identifier for the source sentence
        source_position: Character positions of source keyword
        target_position: Character positions of target keyword
        confidence: Confidence score for this piece of evidence
        metadata: Additional evidence-specific information
    """
    sentence_text: str
    sentence_id: int
    source_position: tuple[int, int]
    target_position: tuple[int, int]
    confidence: float
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Relationship:
    """Represents a relationship between two keywords.
    
    Attributes:
        source_id: ID of the source keyword
        target_id: ID of the target keyword
        relationship_type: Type of relationship
        evidence: List of evidence supporting this relationship
        confidence: Overall confidence score
        metadata: Additional relationship metadata
        created_at: Timestamp of relationship creation
        updated_at: Timestamp of last update
    """
    source_id: str
    target_id: str
    relationship_type: RelationType
    evidence: List[RelationshipEvidence] = field(default_factory=list)
    confidence: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def add_evidence(self, evidence: RelationshipEvidence) -> None:
        """Add new evidence for this relationship.
        
        Updates confidence score using diminishing returns formula.
        """
        self.evidence.append(evidence)
        self.updated_at = datetime.now()
        
        # Update confidence with diminishing returns
        base_confidence = max(e.confidence for e in self.evidence)
        evidence_boost = min(0.5, (len(self.evidence) - 1) * 0.1)
        self.confidence = min(1.0, base_confidence + evidence_boost)

    def to_dict(self) -> Dict[str, Any]:
        """Convert relationship to dictionary format.
        
        Useful for Neo4j storage and API responses.
        """
        return {
            "source_id": self.source_id,
            "target_id": self.target_id,
            "type": self.relationship_type.value,
            "confidence": self.confidence,
            "evidence_count": len(self.evidence),
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }


class RelationshipManager:
    """Manages the creation and tracking of relationships between keywords.
    
    This class handles:
    - Relationship creation and evidence collection
    - Confidence calculation
    - Relationship validation and cleanup
    - Preparation for Neo4j storage
    - Semantic similarity-based relationship detection
    - Contextual proximity relationship creation
    - Hierarchical relationship inference
    """
    
    def __init__(self, nlp=None):
        """
        Initialize relationship manager with optional NLP model.
        
        Args:
            nlp: Optional NLP model for semantic analysis
        """
        # Existing relationship storage
        self._relationships: Dict[tuple[str, str], Relationship] = {}
        self._keyword_types: Dict[str, KeywordType] = {}
        
        # New attribute for storing additional keyword context
        self._keyword_metadata: Dict[str, Dict[str, Any]] = {}
        self._keyword_texts: Dict[str, str] = {}
        
        # Logging for relationship manager
        self.logger = get_logger(__name__)

        # NLP model for semantic analysis
        self.nlp = nlp
    
    def register_keyword(self, 
                        keyword_id: str, 
                        keyword_type: KeywordType, 
                        original_text: Optional[str] = None) -> None:
        """
        Enhanced keyword registration with optional original text.
        
        Args:
            keyword_id: Unique identifier for the keyword
            keyword_type: Type of keyword
            original_text: Original text of the keyword (optional)
        """
        # Existing registration logic
        self._keyword_types[keyword_id] = keyword_type
        
        # Store original text if provided
        if original_text:
            self._keyword_texts[keyword_id] = original_text

    def detect_relationships(
        self, 
        keywords: List[Dict[str, Any]], 
        context: Dict[str, Any]
    ) -> None:
        """
        Comprehensive relationship detection method.
        
        Args:
            keywords: List of keyword dictionaries
            context: Processing context containing content details
        """

        # Clear previous relationship data
        self._relationships.clear()
        self._keyword_types.clear()
        self._keyword_metadata.clear()
        self._keyword_texts.clear()

        # Only proceed if we have multiple keywords
        if len(keywords) < 2:
            return
        
        # Get document identifier from context
        document_id = context.get('document_id')
        if not document_id:
            self.logger.warning("No document_id in context, relationships may be incorrect")
            return
        
        # Filter keywords and content to current document only
        doc_keywords = [k for k in keywords if k.get('document_id') == document_id]
        self.logger.debug(f"Relationship detection starting for document {document_id}")
        self.logger.debug(f"Keywords being processed: {[k.get('canonical_text', '') for k in doc_keywords]}")
        
        doc_content = context.get('cleaned_content', '')
        
        # Create document-specific context
        doc_context = {
            'document_id': document_id,
            'cleaned_content': doc_content,
            'original_url': context.get('original_url')
        }

        # Logging for debugging
        self.logger.debug(f"Attempting to detect relationships for {len(keywords)} keywords")
        
        # Perform different types of relationship detection
        try:
            self._detect_semantic_relationships(doc_keywords, document_id)
            self._detect_contextual_relationships(doc_keywords, doc_context)
            self._detect_hierarchical_relationships(doc_keywords, document_id)
        except Exception as e:
            self.logger.error(f"Relationship detection failed: {str(e)}", exc_info=True)


    def _detect_semantic_relationships(
        self, 
        keywords: List[Dict[str, Any]],
        document_id: str
    ) -> None:
        """
        Detect semantic relationships using NLP similarity.
        """
        if not self.nlp:
            return
        
        doc_keywords = [k for k in keywords if k.get('document_id') == document_id]

        # More aggressive similarity threshold
        SIMILARITY_THRESHOLD = 0.8
        SYNONYM_THRESHOLD = 0.95
        MAX_RELATIONSHIPS_PER_KEYWORD = 5
        
        # Track relationships to limit per keyword
        keyword_relationship_count = defaultdict(int)


        # Prepare NLP docs for keywords in this document
        keyword_docs = {}
        for kw in doc_keywords:
            keyword_id = kw['id']
            text = kw.get('canonical_text', str(kw))
            keyword_docs[keyword_id] = self.nlp(text)

        
        # Compare each keyword with others
        for i, source_kw in enumerate(doc_keywords):
            for j, target_kw in enumerate(doc_keywords[i+1:], start=i+1):
                if (keyword_relationship_count[source_kw['id']] >= MAX_RELATIONSHIPS_PER_KEYWORD or
                    keyword_relationship_count[target_kw['id']] >= MAX_RELATIONSHIPS_PER_KEYWORD):
                    continue
                source_id = source_kw['id']
                target_id = target_kw['id']
                
                # Compute semantic similarity
                similarity = keyword_docs[source_id].similarity(keyword_docs[target_id])
                
                # Threshold for relationship
                if similarity > SIMILARITY_THRESHOLD:
                    # Create relationship evidence
                    evidence = RelationshipEvidence(
                        sentence_text=f"Semantic relationship: {source_kw.get('canonical_text', source_id)} ~ {target_kw.get('canonical_text', target_id)}",
                        sentence_id=0,
                        source_position=(0, len(str(source_kw.get('canonical_text', source_id)))),
                        target_position=(0, len(str(target_kw.get('canonical_text', target_id)))),
                        confidence=similarity,
                        metadata={
                            "detection_method": "semantic_similarity",
                            "nlp_score": similarity
                        }
                    )
                    
                    # Determine relationship type
                    rel_type = (
                        RelationType.SYNONYM if similarity > SYNONYM_THRESHOLD
                        else RelationType.RELATED
                    )
                    
                    # Register relationship
                    self.add_relationship(
                        source_id=source_id,
                        target_id=target_id,
                        rel_type=rel_type,
                        evidence=evidence
                    )

                    # Update relationship counts
                    keyword_relationship_count[source_id] += 1
                    keyword_relationship_count[target_id] += 1
    
    def _detect_contextual_relationships(
        self, 
        keywords: List[Dict[str, Any]], 
        context: Dict[str, Any]
    ) -> None:
        """
        Detect relationships based on contextual proximity.
        
        Uses sentence-level context instead of entire document.
        """

        # Ensure NLP model is available
        if not self.nlp:
            return
        
        # Get document ID and content
        document_id = context.get('document_id')
        cleaned_content = context.get('cleaned_content', '')

        # Filter keywords to current document
        doc_keywords = [k for k in keywords if k.get('document_id') == document_id]
    
        # Use spaCy's sentence segmentation
        doc = self.nlp(cleaned_content)
        
        # Break content into sentences
        sentences = [sent.text.strip() for sent in doc.sents]
        
        # Iterate through all unique pairs of keywords
        for i in range(len(keywords)):
            for j in range(i + 1, len(keywords)):
                source_kw = keywords[i]
                target_kw = keywords[j]
                
                source_text = source_kw.get('canonical_text', str(source_kw))
                target_text = target_kw.get('canonical_text', str(target_kw))
                
                # Track matching sentences
                matching_sentences = []
                
                # Check each sentence for keyword co-occurrence
                for sent in sentences:
                    if source_text.lower() in sent.lower() and target_text.lower() in sent.lower():
                        # Calculate proximity score based on keywords' positions in sentence
                        source_pos = sent.lower().index(source_text.lower())
                        target_pos = sent.lower().index(target_text.lower())
                        
                        # Calculate proximity score
                        proximity = 1.0 / (abs(source_pos - target_pos) + 1)
                        
                        matching_sentences.append({
                            'sentence': sent,
                            'proximity': proximity
                        })
                
                # If matching sentences found, create relationship
                if matching_sentences:
                    # Use the sentence with the highest proximity
                    best_match = max(matching_sentences, key=lambda x: x['proximity'])
                    
                    # Create relationship evidence
                    evidence = RelationshipEvidence(
                        sentence_text=best_match['sentence'],
                        sentence_id=0,
                        source_position=(0, len(source_text)),
                        target_position=(0, len(target_text)),
                        confidence=best_match['proximity'],
                        metadata={
                            "detection_method": "sentence_proximity",
                            "distance_score": best_match['proximity']
                        }
                    )
                    
                    # Register relationship
                    self.add_relationship(
                        source_id=source_kw['id'],
                        target_id=target_kw['id'],
                        rel_type=RelationType.RELATED,
                        evidence=evidence
                    )
    
    def _detect_hierarchical_relationships(
        self, 
        keywords: List[Dict[str, Any]],
        document_id: str
    ) -> None:
        """
        Detect hierarchical relationships between keywords in the same document.
        """
        # Filter keywords to current document only
        doc_keywords = [kw for kw in keywords if kw.get('document_id') == document_id]
        
        # Compare each pair of keywords within this document
        for i in range(len(doc_keywords)):
            for j in range(i + 1, len(doc_keywords)):
                source_kw = doc_keywords[i]
                target_kw = doc_keywords[j]
                
                source_text = source_kw.get('canonical_text', str(source_kw))
                target_text = target_kw.get('canonical_text', str(target_kw))
                
                # Substring relationship
                if source_text in target_text or target_text in source_text:
                    # Determine hierarchical relationship type
                    source_type = source_kw.get('keyword_type', KeywordType.TERM)
                    target_type = target_kw.get('keyword_type', KeywordType.TERM)
                    
                    if (source_type == KeywordType.CONCEPT and 
                        target_type == KeywordType.TERM):
                        rel_type = RelationType.HIERARCHICAL
                    else:
                        rel_type = RelationType.RELATED
                    
                    # Create relationship evidence
                    evidence = RelationshipEvidence(
                        sentence_text=f"Hierarchical relationship: {source_text} contains/related to {target_text}",
                        sentence_id=0,
                        source_position=(0, len(source_text)),
                        target_position=(0, len(target_text)),
                        confidence=0.8,
                        metadata={
                            "detection_method": "substring_hierarchy",
                            "source_type": str(source_type),
                            "target_type": str(target_type)
                        }
                    )
                    
                    # Register relationship
                    self.add_relationship(
                        source_id=source_kw['id'],
                        target_id=target_kw['id'],
                        rel_type=rel_type,
                        evidence=evidence
                    )

    
    def add_relationship(self,
                        source_id: str,
                        target_id: str,
                        rel_type: RelationType,
                        evidence: RelationshipEvidence) -> None:
        """Add or update a relationship with new evidence."""

        # Register keywords if not already registered
        if source_id not in self._keyword_types:
            # Default to TERM type if not specified
            self._keyword_types[source_id] = KeywordType.TERM

        if target_id not in self._keyword_types:
            # Default to TERM type if not specified
            self._keyword_types[target_id] = KeywordType.TERM

        
        # Ensure consistent ordering for undirected relationships
        if rel_type in {RelationType.SYNONYM, RelationType.RELATED}:
            if source_id > target_id:
                source_id, target_id = target_id, source_id
                # Swap positions in evidence
                evidence.source_position, evidence.target_position = (
                    evidence.target_position, evidence.source_position
                )
        
        # Get or create relationship
        key = (source_id, target_id)
        if key not in self._relationships:
            self._relationships[key] = Relationship(
                source_id=source_id,
                target_id=target_id,
                relationship_type=rel_type
            )
        
        # Add new evidence
        self._relationships[key].add_evidence(evidence)
    
    def get_relationship(self,
                        source_id: str,
                        target_id: str) -> Optional[Relationship]:
        """Get relationship between two keywords if it exists."""
        # Check both directions for undirected relationships
        key = (source_id, target_id)
        if key in self._relationships:
            return self._relationships[key]
            
        key = (target_id, source_id)
        rel = self._relationships.get(key)
        if rel and rel.relationship_type in {RelationType.SYNONYM, RelationType.RELATED}:
            return rel
            
        return None
    
    def get_relationships_for_keyword(self,
                                    keyword_id: str,
                                    min_confidence: float = 0.0
                                    ) -> List[Relationship]:
        """Get all relationships involving a keyword."""
        relationships = []
        
        # Check relationships where keyword is source
        for (source, target), rel in self._relationships.items():
            if rel.confidence < min_confidence:
                continue
                
            if source == keyword_id:
                relationships.append(rel)
            elif target == keyword_id:
                # For undirected relationships, include where keyword is target
                if rel.relationship_type in {RelationType.SYNONYM, RelationType.RELATED}:
                    relationships.append(rel)
        
        return relationships
    
    def get_related_keywords(self,
                           keyword_id: str,
                           rel_type: Optional[RelationType] = None,
                           min_confidence: float = 0.0
                           ) -> List[tuple[str, RelationType, float]]:
        """Get keywords related to the given keyword."""
        related = []
        
        for rel in self.get_relationships_for_keyword(keyword_id, min_confidence):
            if rel_type and rel.relationship_type != rel_type:
                continue
                
            other_id = rel.target_id if rel.source_id == keyword_id else rel.source_id
            related.append((other_id, rel.relationship_type, rel.confidence))
        
        return sorted(related, key=lambda x: x[2], reverse=True)
    
    def get_keyword_type(self, keyword_id: str) -> Optional[KeywordType]:
            """Get the type of a registered keyword."""
            return self._keyword_types.get(keyword_id)
        
    def prepare_neo4j_relationships(
        self, 
        min_confidence: float = 0.5  # Moderate confidence threshold
    ) -> List[Dict[str, Any]]:
        """
        Prepare relationships for Neo4j storage with moderate confidence threshold.
        """
        neo4j_rels = []
        
        for rel in self._relationships.values():
            # More moderate confidence threshold
            if rel.confidence < min_confidence:
                continue
            
            # Prepare evidence details
            evidence_details = [
                {
                    "sentence": ev.sentence_text,
                    "confidence": ev.confidence,
                    "metadata": ev.metadata
                } for ev in rel.evidence
            ]
            
            neo4j_rels.append({
                "source_id": rel.source_id,
                "target_id": rel.target_id,
                "type": rel.relationship_type.value,
                "properties": {
                    "confidence": rel.confidence,
                    "evidence_count": len(rel.evidence),
                    "evidence": evidence_details,
                    "created_at": rel.created_at.isoformat(),
                    "updated_at": rel.updated_at.isoformat()
                }
            })
        
        return neo4j_rels