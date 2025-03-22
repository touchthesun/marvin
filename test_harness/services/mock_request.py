import json

class MockRequest:
    """Simple request class for mocking aiohttp requests."""
    
    def __init__(self, method, path, data=None, headers=None):
        from core.utils.logger import get_logger
        self.logger = get_logger("test.mock.MockRequest")
        
        self.method = method
        self.path = path
        self.data = data
        self.headers = headers or {}
        
        # Log for debugging
        self.logger.debug(f"MockRequest created: {method} {path}")
        if data:
            try:
                self.logger.debug(f"With data: {json.dumps(data)[:200]}...")
            except:
                self.logger.debug(f"With data (non-JSON): {str(data)[:200]}...")
        
        if headers:
            self.logger.debug(f"With headers: {headers}")
        
        # Parse query parameters
        import urllib.parse
        self.query = {}
        if '?' in path:
            query_string = path.split('?', 1)[1]
            self.query = dict(urllib.parse.parse_qsl(query_string))
        
    async def json(self):
        """Get request data as JSON."""
        return self.data
    
    def __str__(self):
        """String representation for debugging."""
        return f"MockRequest({self.method} {self.path}, data={self.data}, headers={self.headers})"
    

