from urllib.parse import urlparse


def extract_domain(url: str) -> str:
    """Extract the domain from a URL.
    
    Args:
        url: The URL to process
        
    Returns:
        The domain name
        
    Examples:
        >>> extract_domain("https://docs.example.com/path")
        'example.com'
        >>> extract_domain("http://localhost:8000")
        'localhost'
        >>> extract_domain("chrome://extensions")
        'chrome'
        >>> extract_domain("file:///path/to/file.html")
        'localhost'
    """
    try:
        parsed = urlparse(url)
        
        # Handle special browser schemes
        if parsed.scheme in {'chrome', 'edge', 'firefox', 'brave'}:
            return parsed.scheme
            
        # Handle file URLs
        if parsed.scheme == 'file':
            return 'localhost'
            
        # Handle standard URLs
        if parsed.netloc:
            # Split on dots and handle subdomains
            parts = parsed.netloc.split('.')
            
            # Remove port if present in last part
            if ':' in parts[-1]:
                parts[-1] = parts[-1].split(':')[0]
                
            # Handle IP addresses
            if all(part.isdigit() for part in parts):
                return parsed.netloc
                
            # Get domain and TLD
            if len(parts) > 2:
                return '.'.join(parts[-2:])
            return parsed.netloc
            
        return 'unknown'
        
    except Exception as e:
        # Log error and return safe default
        print(f"Error extracting domain from {url}: {str(e)}")
        return 'unknown'

def normalize_url(url: str) -> str:
    """Normalize a URL for consistent comparison.
    
    Args:
        url: The URL to normalize
        
    Returns:
        Normalized URL
        
    Examples:
        >>> normalize_url("HTTPS://Example.COM/Path/")
        'https://example.com/Path'
        >>> normalize_url("http://example.com")
        'http://example.com'
    """
    try:
        parsed = urlparse(url)
        
        # Convert scheme and netloc to lowercase
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        
        # Remove trailing slash from path
        path = parsed.path.rstrip('/')
        
        # Reconstruct URL
        normalized = f"{scheme}://{netloc}{path}"
        if parsed.query:
            normalized += f"?{parsed.query}"
        if parsed.fragment:
            normalized += f"#{parsed.fragment}"
            
        return normalized
        
    except Exception as e:
        # Log error and return original
        print(f"Error normalizing {url}: {str(e)}")
        return url

def is_valid_url(url: str) -> bool:
    """Check if a URL is valid.
    
    Args:
        url: The URL to validate
        
    Returns:
        True if URL is valid, False otherwise
        
    Examples:
        >>> is_valid_url("https://example.com")
        True
        >>> is_valid_url("not_a_url")
        False
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False