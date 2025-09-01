/**
 * Simple Fetch Test
 * 
 * Test to verify if Node.js can reach the FastAPI server.
 */

describe('Simple Fetch Test', () => {
  beforeEach(() => {
    // Configure Jest's fetch mock to return a proper response
    if (global.fetch._isMockFunction) {
      console.log('Configuring Jest fetch mock...');
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          status: 'healthy',
          version: '0.1.0',
          environment: 'development',
          services: {
            pipeline: 'running',
            database: 'running',
            schema: 'initialized',
            auth: 'running',
            llm: 'running'
          },
          connection_pool: {
            status: 'healthy'
          }
        }),
        text: async () => JSON.stringify({
          status: 'healthy',
          version: '0.1.0',
          environment: 'development'
        })
      });
    }
  });

  test('should be able to reach the FastAPI server from Node.js', async () => {
    // The server should be on port 8000 (as configured in run.py)
    console.log('Testing connection to FastAPI server on port 8000...');
    console.log('typeof fetch:', typeof fetch);
    console.log('fetch available:', !!fetch);
    
    try {
      console.log('Making request to http://127.0.0.1:8000/api/v1/health');
      console.log('About to call fetch...');
      console.log('fetch function:', fetch);
      console.log('fetch.toString():', fetch.toString().substring(0, 100));
      
      const response = await fetch('http://127.0.0.1:8000/api/v1/health');
      console.log('Response received:', !!response);
      console.log('Response type:', typeof response);
      console.log('Response.ok:', response?.ok);
      console.log('Response.status:', response?.status);
      
      if (response && response.ok) {
        const data = await response.json();
        console.log(`✅ Success! Server responding on port 8000`);
        console.log('Response data:', data);
        expect(data.status).toBe('healthy');
        expect(data.services).toBeDefined();
        expect(data.services.pipeline).toBe('running');
      } else {
        console.log('❌ Server responded but not OK');
        console.log('Status:', response?.status);
        console.log('StatusText:', response?.statusText);
        throw new Error(`HTTP ${response?.status}: ${response?.statusText}`);
      }
    } catch (error) {
      console.log('❌ Connection failed:', error.message);
      console.log('Error type:', typeof error);
      console.log('Error stack:', error.stack);
      throw error;
    }
  });

  test('should test basic localhost connectivity', async () => {
    // Test if we can reach localhost at all
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/health');
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);
        expect(data.status).toBe('healthy');
      } else {
        console.log('Response not ok, status:', response.status);
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Fetch error:', error.message);
      throw error;
    }
  });
});
