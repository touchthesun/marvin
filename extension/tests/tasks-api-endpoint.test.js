/**
 * TDD for Tasks API Endpoint Investigation
 * This test will expose why the /tasks endpoint returns 404
 */

describe('Tasks API Endpoint Investigation', () => {
  const API_BASE = 'http://localhost:8000';

  test('1. Health endpoint is accessible', async () => {
    // Test: Can we reach the API server at all?
    try {
      const response = await fetch(`${API_BASE}/api/v1/health`);
      console.log('Health endpoint status:', response.status);
      console.log('Health endpoint ok:', response.ok);
      
      const data = await response.json();
      console.log('Health endpoint response:', data);
      
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    } catch (error) {
      console.log('Health endpoint error:', error.message);
      throw error;
    }
  });

  test('2. API v1 root is accessible', async () => {
    // Test: Is the API v1 prefix working?
    try {
      const response = await fetch(`${API_BASE}/api/v1/`);
      console.log('API v1 root status:', response.status);
      console.log('API v1 root response headers:', Object.fromEntries(response.headers.entries()));
      
      // Even if it returns 404, we want to see what happens
      const text = await response.text();
      console.log('API v1 root response text:', text.substring(0, 200));
      
    } catch (error) {
      console.log('API v1 root error:', error.message);
      throw error;
    }
  });

  test('3. Tasks endpoint direct test', async () => {
    // Test: What exactly happens when we call /tasks?
    try {
      const response = await fetch(`${API_BASE}/api/v1/tasks`);
      console.log('Tasks endpoint status:', response.status);
      console.log('Tasks endpoint ok:', response.ok);
      console.log('Tasks endpoint headers:', Object.fromEntries(response.headers.entries()));
      
      const text = await response.text();
      console.log('Tasks endpoint response text:', text);
      
      if (response.ok) {
        try {
          const data = JSON.parse(text);
          console.log('Tasks endpoint JSON:', data);
        } catch (parseError) {
          console.log('Tasks endpoint - not valid JSON');
        }
      }
      
    } catch (error) {
      console.log('Tasks endpoint error:', error.message);
      throw error;
    }
  });

  test('4. Available endpoints discovery', async () => {
    // Test: What endpoints are actually available?
    const testEndpoints = [
      '/api/v1/pages',
      '/api/v1/stats', 
      '/api/v1/embeddings',
      '/api/v1/tasks',
      '/api/v1/analysis',
      '/api/v1/graph'
    ];

    for (const endpoint of testEndpoints) {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        console.log(`${endpoint}: ${response.status} ${response.statusText}`);
      } catch (error) {
        console.log(`${endpoint}: ERROR - ${error.message}`);
      }
    }
  });

  test('5. OpenAPI docs check', async () => {
    // Test: Can we see the API documentation?
    try {
      const response = await fetch(`${API_BASE}/docs`);
      console.log('OpenAPI docs status:', response.status);
      
      if (response.ok) {
        const html = await response.text();
        const hasTasksEndpoint = html.includes('/tasks') || html.includes('tasks');
        console.log('OpenAPI docs contains tasks endpoint:', hasTasksEndpoint);
        
        // Look for specific patterns
        const taskMatches = html.match(/tasks?/gi) || [];
        console.log('Task-related matches in docs:', taskMatches.length);
      }
      
    } catch (error) {
      console.log('OpenAPI docs error:', error.message);
    }
  });

  test('6. Alternative tasks endpoint formats', async () => {
    // Test: Try different URL formats
    const alternatives = [
      '/tasks',
      '/api/v1/tasks/',
      '/api/v1/tasks/all',
      '/tasks/',
      '/api/tasks'
    ];

    for (const alt of alternatives) {
      try {
        const response = await fetch(`${API_BASE}${alt}`);
        console.log(`${alt}: ${response.status} ${response.statusText}`);
        
        if (response.status !== 404) {
          const text = await response.text();
          console.log(`${alt} response:`, text.substring(0, 100));
        }
      } catch (error) {
        console.log(`${alt}: ERROR - ${error.message}`);
      }
    }
  });
});
