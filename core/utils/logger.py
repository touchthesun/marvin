import logging
from typing import Optional
from core.utils.config import load_config

# Load configuration once at module level
config = load_config()
DEFAULT_LOGGING_LEVEL = logging.INFO
DEFAULT_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
DEFAULT_DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """Creates and returns a configured logger.
    
    Args:
        name: Name of the logger, usually __name__ to reflect the module's name
        level: Optional override for log level
        
    Returns:
        Configured logger instance
    """
    # Get logging level from config, arguments, or default
    print(f"Config logging level: {config.get('logging_level')}")
    log_level = (level or 
                config.get("logging_level") or 
                DEFAULT_LOGGING_LEVEL)
    
    if isinstance(log_level, str):
        print(f"Converting string level: {log_level}")  # Debug line
        log_level = getattr(logging, log_level.upper())
    
    # Configure root logger if not already configured
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=log_level,
            format=DEFAULT_FORMAT,
            datefmt=DEFAULT_DATE_FORMAT,
            encoding='utf-8'
        )
    
    # Get or create logger
    logger = logging.getLogger(name)
    print(f"Setting logger level to: {log_level}")  # Debug line
    logger.setLevel(log_level)
    
    # Add handler with custom formatting if none exist
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            DEFAULT_FORMAT,
            datefmt=DEFAULT_DATE_FORMAT
        )
        handler.setFormatter(formatter)
        handler.setLevel(log_level)
        logger.addHandler(handler)
    
    return logger