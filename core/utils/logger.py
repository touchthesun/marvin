import logging
from typing import Optional
from core.utils.config import load_config

# Load configuration once at module level
config = load_config()
DEFAULT_LOGGING_LEVEL = logging.INFO
DEFAULT_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
DEFAULT_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """Creates and returns a configured logger."""
    logger = logging.getLogger(name)
    
    # Debug logging configuration
    logger.debug(f"Configuring logger {name}")
    logger.debug(f"Current handlers: {logger.handlers}")
    logger.debug(f"Root logger handlers: {logging.getLogger().handlers}")
    
    # Get logging level from config, arguments, or default
    log_level = (level or 
                config.get("logging_level") or 
                DEFAULT_LOGGING_LEVEL)
    
    if isinstance(log_level, str):
        log_level = getattr(logging, log_level.upper())
    
    # Configure root logger ONLY if it has no handlers
    root = logging.getLogger()
    if not root.handlers:
        logger.debug("Configuring root logger")
        logging.basicConfig(
            level=log_level,
            format=DEFAULT_FORMAT,
            datefmt=DEFAULT_DATE_FORMAT,
            encoding='utf-8'
        )
    
    # Set level but DON'T add handlers if root is configured
    logger.setLevel(log_level)
    
    if not logger.handlers and not root.handlers:
        logger.debug("Adding handler to logger")
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            DEFAULT_FORMAT,
            datefmt=DEFAULT_DATE_FORMAT
        )
        handler.setFormatter(formatter)
        handler.setLevel(log_level)
        logger.addHandler(handler)
    
    return logger