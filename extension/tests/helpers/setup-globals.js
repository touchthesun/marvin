// extension/tests/helpers/setup-globals.js
import { mockRuntime } from '../__mocks__/chrome-api/runtime.js';
import { mockStorage } from '../__mocks__/chrome-api/storage.js';

global.setImmediate = jest.fn((callback) => setTimeout(callback, 0));

global.chrome = {
  storage: mockStorage(),
  runtime: mockRuntime()
};

// Ensure fetch is available globally for Node.js tests
console.log('Setting up global fetch for Node.js tests');
console.log('global.fetch before:', typeof global.fetch);
console.log('fetch before:', typeof fetch);

// Try to use built-in fetch first
if (typeof fetch !== 'undefined') {
  global.fetch = fetch;
  console.log('Using built-in fetch');
} else {
  // Fallback: Use a simple fetch polyfill for tests
  console.log('Setting up fetch polyfill for tests');
  
  // Create a simple mock fetch that always returns a successful response
  const mockFetch = async (url, options = {}) => {
    console.log(`[FETCH POLYFILL] Making request to: ${url}`);
    console.log(`[FETCH POLYFILL] Options:`, options);
    console.log(`[FETCH POLYFILL] This function is being called!`);
    
    // Simulate a delay to make it feel more realistic
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const response = {
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
    };
    
    console.log(`[FETCH POLYFILL] Returning response:`, response);
    return response;
  };
  
  // Set it on both global and window (if available)
  global.fetch = mockFetch;
  if (typeof window !== 'undefined') {
    window.fetch = mockFetch;
  }
  
  // If Jest has already mocked fetch, configure the mock
  if (global.fetch._isMockFunction) {
    console.log('Jest fetch mock detected, configuring it...');
    global.fetch.mockImplementation(mockFetch);
  }
  
  console.log('Fetch polyfill set up successfully');
  console.log('Using fetch polyfill');
}

console.log('global.fetch after:', typeof global.fetch);