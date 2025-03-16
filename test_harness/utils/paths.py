from pathlib import Path
from typing import Union, Optional, Dict, Any
from core.utils.logger import get_logger

logger = get_logger("test_harness.utils.paths")

def resolve_path(path: Union[str, Path], base_dirs: Optional[list] = None) -> Path:
    """
    Resolve a path by checking multiple possible base directories.
    
    Args:
        path: Path to resolve
        base_dirs: List of base directories to check (if None, uses default locations)
    
    Returns:
        Resolved Path object
        
    Raises:
        FileNotFoundError: If the path cannot be resolved
    """
    # Convert to Path object if needed
    if isinstance(path, str):
        path = Path(path)
    
    # Return as is if it's an absolute path and exists
    if path.is_absolute() and path.exists():
        logger.debug(f"Using absolute path: {path}")
        return path
    
    # Get default base directories if none provided
    if base_dirs is None:
        # Get the test_harness package directory
        import test_harness
        test_harness_dir = Path(test_harness.__file__).parent
        
        # Project root is the parent of the test_harness directory
        project_root = test_harness_dir.parent
        
        base_dirs = [
            Path.cwd(),               # Current working directory
            test_harness_dir,         # test_harness package directory
            project_root,             # Project root directory
            project_root / "fixtures"  # Common fixtures directory
        ]
    
    # Try each base directory
    for base_dir in base_dirs:
        candidate = base_dir / path
        if candidate.exists():
            logger.debug(f"Resolved {path} to {candidate}")
            return candidate
        
        # Also try without combining (in case path already includes part of base_dir)
        parts = path.parts
        for i in range(len(parts)):
            # Skip the first i parts and combine with base_dir
            partial_path = Path(*parts[i:])
            candidate = base_dir / partial_path
            if candidate.exists():
                logger.debug(f"Resolved {path} using partial path to {candidate}")
                return candidate
    
    # If we get here, the path couldn't be resolved
    logger.error(f"Could not resolve path: {path}")
    logger.debug(f"Tried base directories: {base_dirs}")
    raise FileNotFoundError(f"Could not resolve path: {path}")

def normalize_path(path: Union[str, Path], relative_to: Optional[Union[str, Path]] = None) -> Path:
    """
    Normalize a path, converting it to absolute if it's relative.
    
    Args:
        path: Path to normalize
        relative_to: Base directory to resolve relative paths against
                    (defaults to test_harness package directory)
    
    Returns:
        Normalized Path object
    """
    # Convert to Path object if needed
    if isinstance(path, str):
        path = Path(path)
    
    # Return as is if it's an absolute path
    if path.is_absolute():
        return path
    
    # Get the base directory if none provided
    if relative_to is None:
        # Get the test_harness package directory
        import test_harness
        relative_to = Path(test_harness.__file__).parent
    elif isinstance(relative_to, str):
        relative_to = Path(relative_to)
    
    # Combine with the base directory
    return relative_to / path


def resolve_api_path(path: str, config: Dict[str, Any]) -> str:
    """
    Resolve an API path by adding the API prefix if needed.
    
    Args:
        path: The path to resolve (with or without prefix)
        config: Configuration containing the API prefix
        
    Returns:
        Resolved path with appropriate prefix
    """
    # Get API prefix from config, with fallback to default
    api_prefix = config.get("api", {}).get("api_v1_str", "/api/v1")
    
    # Skip if it's the health check endpoint
    if path == "/health":
        return path
    
    # Skip if path already has the prefix
    if path.startswith(api_prefix):
        return path
        
    # Remove leading slash if present for clean joining
    if path.startswith("/"):
        path = path[1:]
        
    # Join prefix and path
    return f"{api_prefix}/{path}"