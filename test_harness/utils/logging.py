import logging
import datetime
from pathlib import Path
from core.utils.logger import get_logger

def setup_test_harness_logging(log_level=None, log_dir="logs"):
    """
    Set up logging for the test harness with both console and file output.
    
    Args:
        log_level: Logging level (default: use system default)
        log_dir: Directory for log files (default: logs)
        
    Returns:
        Tuple of (logger, log_file_path)
    """
    # Create logs directory if it doesn't exist
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)
    
    # Create a timestamped log file name
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = log_path / f"test_harness_{timestamp}.log"
    
    # Get the root logger
    root_logger = logging.getLogger()
    
    # Add file handler
    file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
    
    # Use the same formatter as configured in the core logger
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    
    # Set the file handler's level
    if log_level:
        if isinstance(log_level, str):
            log_level = getattr(logging, log_level.upper())
        file_handler.setLevel(log_level)
    
    # Add file handler to root logger
    root_logger.addHandler(file_handler)
    
    # Get a logger for the test harness
    logger = get_logger("test_harness", level=log_level)
    logger.info(f"Test harness logging initialized. Log file: {log_file}")
    
    return logger, log_file