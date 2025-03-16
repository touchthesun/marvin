from urllib.parse import urlparse

def get_domain_from_url(url: str) -> str:
    """Extract domain from URL."""

    
    try:
        parsed = urlparse(url)
        domain_parts = parsed.netloc.split('.')
        
        # Handle subdomains
        if len(domain_parts) > 2:
            return '.'.join(domain_parts[-2:])
        return parsed.netloc
    except:
        # Fallback
        return "unknown"