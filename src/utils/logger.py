import logging
from config import LOGGING_LEVEL

# You can set a default logging level here and override it using an environment variable
default_logging_level = logging.INFO
logging_level = LOGGING_LEVEL

def get_logger(name):
    """
    Creates and returns a configured logger.

    Parameters:
    - name (str): Name of the logger, usually __name__ to reflect the module's name.

    Returns:
    - logger (logging.Logger): Configured logger instance.
    """
    # Configure logging
    logging.basicConfig(
        level=logging_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Create a logger instance with the specified name
    logger = logging.getLogger(name)

    return logger


def format_embedding_for_logging(embedding, preview_length=3):
    preview_start = ', '.join(map(str, embedding[:preview_length]))
    preview_end = ', '.join(map(str, embedding[-preview_length:]))
    return f"Embedding (length {len(embedding)}): [{preview_start} ... {preview_end}]"
