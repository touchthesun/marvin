from dataclasses import dataclass, field
from typing import Dict, Set, List, Optional, Tuple, Any
from core.utils.logger import get_logger
from .types import (
    EntityType, EntityMention, RelationshipContext,
    ProcessingError, ExtractionError
)

logger = get_logger(__name__)


@dataclass
class RelationshipEvidence:
    """Evidence collected for a potential relationship between entities.
    
    Attributes:
        source: Source entity text
        target: Target entity text
        contexts: List of contexts supporting the relationship
        confidence: Confidence score based on evidence
    """
    source: str
    target: str
    contexts: List[RelationshipContext] = field(default_factory=list)
    confidence: float = 0.0

    def add_context(self, context: RelationshipContext) -> None:
        """Add a new context to the evidence with diminishing returns on confidence."""
        self.contexts.append(context)
        # Each new piece of evidence increases confidence, but with diminishing returns
        self.confidence = min(1.0, self.confidence + (1.0 - self.confidence) * 0.1)


@dataclass
class Entity:
    """An entity with all its mentions and metadata.
    
    Attributes:
        text: The canonical text for this entity
        type: The entity type
        mentions: List of all mentions of this entity
        properties: Additional entity properties
    """
    text: str
    type: EntityType
    mentions: List[EntityMention] = field(default_factory=list)
    properties: Dict[str, Any] = field(default_factory=dict)

    def store_mention(self, mention: EntityMention) -> None:
        """Store a new mention of this entity."""
        if mention.type != self.type:
            logger.warning(f"Type mismatch for entity '{self.text}': "
                         f"existing={self.type}, new={mention.type}")
        self.mentions.append(mention)

    def get_confidence(self) -> float:
        """Calculate confidence score based on mentions."""
        if not self.mentions:
            return 0.0
            
        # Average mention scores with additional weight for frequency
        base_score = sum(m.score for m in self.mentions) / len(self.mentions)
        frequency_boost = min(0.5, (len(self.mentions) - 1) * 0.1)
        return min(1.0, base_score + frequency_boost)


class EntityContext:
    """Manages entity recognition and relationship tracking.
    
    This class handles:
    - Entity mention storage and tracking
    - Relationship evidence collection
    - Confidence calculation
    - Context-aware entity resolution
    """
    
    def __init__(self):
        try:
            self.entities: Dict[str, Entity] = {}
            self.evidence: Dict[Tuple[str, str], RelationshipEvidence] = {}
            logger.info("EntityContext initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize EntityContext: {e}")
            raise ProcessingError(f"Initialization failed: {str(e)}")
    
    def store_mention(self, mention: EntityMention) -> None:
        """Store a mention of an entity in the context."""
        try:
            if not mention or not mention.text:
                raise ValueError("Invalid mention data")
                
            if mention.text not in self.entities:
                self.entities[mention.text] = Entity(
                    text=mention.text,
                    type=mention.type
                )
            self.entities[mention.text].store_mention(mention)
            logger.debug(f"Stored mention for entity: {mention.text}")
            
        except Exception as e:
            logger.error(f"Error storing mention: {e}", exc_info=True)
            raise ProcessingError(f"Failed to store mention: {str(e)}")
    
    def store_relationship(self, entity1: str, entity2: str, 
                         context: RelationshipContext) -> None:
        """Store evidence for a potential relationship between entities."""
        try:
            if not entity1 or not entity2:
                raise ValueError("Invalid entity identifiers")

            if entity1 > entity2:  # Ensure consistent ordering
                entity1, entity2 = entity2, entity1
                # Swap positions in context
                context.entity1_position, context.entity2_position = (
                    context.entity2_position, context.entity1_position
                )
                
            key = (entity1, entity2)
            if key not in self.evidence:
                self.evidence[key] = RelationshipEvidence(
                    source=entity1,
                    target=entity2
                )
            self.evidence[key].add_context(context)
            logger.debug(f"Stored relationship evidence for {entity1} -> {entity2}")
            
        except Exception as e:
            logger.error(f"Error storing relationship: {e}", exc_info=True)
            raise ProcessingError(f"Failed to store relationship: {str(e)}")
    
    def fetch_relationships(self, min_confidence: float = 0.5
                          ) -> List[Tuple[str, str, float]]:
        """Retrieve all entity relationships above confidence threshold."""
        try:
            if not 0 <= min_confidence <= 1:
                raise ValueError("Confidence threshold must be between 0 and 1")
                
            relationships = []
            for (source, target), evidence in self.evidence.items():
                if evidence.confidence >= min_confidence:
                    relationships.append((source, target, evidence.confidence))
            
            logger.debug(f"Retrieved {len(relationships)} relationships above "
                        f"confidence {min_confidence}")
            return relationships
            
        except Exception as e:
            logger.error(f"Error fetching relationships: {e}", exc_info=True)
            raise ProcessingError(f"Failed to fetch relationships: {str(e)}")
    
    def calculate_confidence(self, entity: str) -> float:
        """Calculate confidence score for an entity based on mentions and relationships."""
        try:
            if not entity:
                raise ValueError("Entity identifier cannot be empty")
                
            if entity not in self.entities:
                return 0.0
                
            # Get base confidence from entity mentions
            entity_confidence = self.entities[entity].get_confidence()
            
            # Factor in relationship evidence
            evidence_count = sum(1 for key in self.evidence.keys()
                               if entity in key)
            relationship_boost = min(0.5, evidence_count * 0.1)
            
            final_confidence = min(1.0, entity_confidence + relationship_boost)
            
            logger.debug(f"Calculated confidence {final_confidence:.2f} for entity '{entity}' "
                        f"(base={entity_confidence:.2f}, boost={relationship_boost:.2f})")
            
            return final_confidence
            
        except Exception as e:
            logger.error(f"Error calculating confidence: {e}", exc_info=True)
            raise ProcessingError(f"Failed to calculate confidence: {str(e)})")
    
    def get_entity_type(self, entity: str) -> Optional[EntityType]:
        """Get the type of an entity if it exists."""
        return self.entities[entity].type if entity in self.entities else None
    
    def get_entity_mentions(self, entity: str) -> List[EntityMention]:
        """Get all mentions of an entity."""
        return (self.entities[entity].mentions.copy() 
                if entity in self.entities else [])
    
    def get_related_entities(self, entity: str,
                           min_confidence: float = 0.5
                           ) -> List[Tuple[str, float]]:
        """Get all entities related to the given entity above confidence threshold."""
        related = []
        for (source, target), evidence in self.evidence.items():
            if evidence.confidence >= min_confidence:
                if source == entity:
                    related.append((target, evidence.confidence))
                elif target == entity:
                    related.append((source, evidence.confidence))
        return sorted(related, key=lambda x: x[1], reverse=True)