import spacy
from typing import Optional
from core.utils.logger import get_logger

logger = get_logger(__name__)

def initialize_spacy_model(model_name: str = "en_core_web_sm") -> Optional['spacy.language.Language']:
    """Initialize and return a spaCy language model.
    
    Args:
        model_name: Name of the spaCy model to load
        
    Returns:
        Loaded spaCy model, or None if initialization fails
    """
    try:
        logger.info(f"Loading spaCy model: {model_name}")
        nlp = spacy.load(model_name)
        logger.info(f"Successfully loaded spaCy model: {model_name}")
        return nlp
    except OSError as e:
        logger.error(f"Failed to load spaCy model {model_name}: {e}")
        try:
            # Fall back to smaller model
            fallback_model = "en_core_web_sm"
            logger.warning(f"Falling back to smaller model: {fallback_model}")
            nlp = spacy.load(fallback_model)
            logger.info(f"Loaded fallback spaCy model: {fallback_model}")
            return nlp
        except OSError as e2:
            logger.error(f"Failed to load fallback model: {e2}")
            # If no models are installed, use a blank model
            logger.warning("No spaCy models found. Using blank model.")
            nlp = spacy.blank("en")
            return nlp
    except Exception as e:
        logger.error(f"Unexpected error loading spaCy model: {e}", exc_info=True)
        return None