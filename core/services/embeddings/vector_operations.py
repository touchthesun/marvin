# core/services/embeddings/vector_operations.py
import numpy as np
from typing import List, Union
from core.domain.embeddings.models import EmbeddingVector

from core.utils.logger import get_logger

# Initialize logger
logger = get_logger(__name__)

def cosine_similarity(vec1: Union[List[float], EmbeddingVector], 
                     vec2: Union[List[float], EmbeddingVector]) -> float:
    """Calculate cosine similarity between two vectors."""
    try:
        # Extract vectors if EmbeddingVector objects
        if isinstance(vec1, EmbeddingVector):
            vec1 = vec1.vector
        if isinstance(vec2, EmbeddingVector):
            vec2 = vec2.vector
        
        # Convert to numpy arrays
        a = np.array(vec1)
        b = np.array(vec2)
        
        # Calculate cosine similarity
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        
        if norm_a == 0 or norm_b == 0:
            logger.debug(f"Zero norm detected in cosine similarity calculation. Returning 0.0")
            return 0.0
            
        return np.dot(a, b) / (norm_a * norm_b)
    except Exception as e:
        logger.error(f"Error calculating cosine similarity: {str(e)}")
        return 0.0

def euclidean_distance(vec1: Union[List[float], EmbeddingVector], 
                      vec2: Union[List[float], EmbeddingVector]) -> float:
    """
    Calculate Euclidean distance between two vectors.
    
    Args:
        vec1: First vector or EmbeddingVector
        vec2: Second vector or EmbeddingVector
        
    Returns:
        Euclidean distance
    """
    try:
        # Extract vectors if EmbeddingVector objects
        if isinstance(vec1, EmbeddingVector):
            vec1 = vec1.vector
        if isinstance(vec2, EmbeddingVector):
            vec2 = vec2.vector
            
        # Convert to numpy arrays
        a = np.array(vec1)
        b = np.array(vec2)
        
        # Calculate Euclidean distance
        return np.linalg.norm(a - b)
    except Exception as e:
        logger.error(f"Error calculating Euclidean distance: {str(e)}")
        return float('inf')  # Return infinity as a safe default for distance

def normalize_vector(vector: List[float]) -> List[float]:
    """
    Normalize a vector to unit length.
    
    Args:
        vector: Input vector
        
    Returns:
        Normalized vector
    """
    try:
        vec = np.array(vector)
        norm = np.linalg.norm(vec)
        
        if norm > 0:
            return (vec / norm).tolist()
        
        logger.debug(f"Zero norm detected in normalize_vector. Returning original vector.")
        return vector
    except Exception as e:
        logger.error(f"Error normalizing vector: {str(e)}")
        return vector  # Return original vector on error

def create_centroid(vectors: List[List[float]]) -> List[float]:
    """
    Create a centroid vector from multiple vectors.
    
    Args:
        vectors: List of vectors
        
    Returns:
        Centroid vector (normalized)
    """
    try:
        if not vectors:
            logger.debug("Empty vectors list provided to create_centroid. Returning empty list.")
            return []
            
        # Stack vectors and calculate mean
        stacked = np.vstack(vectors)
        centroid = np.mean(stacked, axis=0)
        
        # Normalize
        return normalize_vector(centroid.tolist())
    except Exception as e:
        logger.error(f"Error creating centroid: {str(e)}")
        return []  # Return empty list on error

def batch_similarity_scores(query_vec: List[float], 
                           vectors: List[List[float]]) -> List[float]:
    """
    Calculate similarity scores for a query vector against multiple vectors.
    
    Args:
        query_vec: Query vector
        vectors: List of vectors to compare against
        
    Returns:
        List of similarity scores
    """
    try:
        if not vectors:
            logger.debug("Empty vectors list provided to batch_similarity_scores. Returning empty list.")
            return []
            
        # Convert to numpy arrays
        query = np.array(query_vec)
        query_norm = np.linalg.norm(query)
        
        if query_norm == 0:
            logger.debug("Zero norm detected for query vector in batch_similarity_scores. Returning zeros.")
            return [0.0] * len(vectors)
        
        # Normalize query
        query = query / query_norm
        
        # Calculate dot products and norms in batch
        matrix = np.vstack(vectors)
        norms = np.linalg.norm(matrix, axis=1)
        
        # Handle zero norms to avoid division by zero
        norms = np.where(norms > 0, norms, 1.0)
        
        # Normalize rows
        normalized_matrix = matrix / norms[:, np.newaxis]
        
        # Calculate cosine similarities
        similarities = np.dot(normalized_matrix, query)
        
        return similarities.tolist()
    except Exception as e:
        logger.error(f"Error calculating batch similarity scores: {str(e)}")
        # Return zeros as a safe default
        return [0.0] * len(vectors) if vectors else []