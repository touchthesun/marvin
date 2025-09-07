// extension/tests/helpers/chrome-api-setup.js
import { createChromeMock } from '../__mocks__/chrome-api.js';

// Setup Chrome API mocks before all tests
beforeAll(() => {
  // Create Chrome API mocks
  const chromeMock = createChromeMock();
  
  // Set up storage mock to return empty data by default
  chromeMock.storage.local.get.mockImplementation((keys, callback) => {
    if (callback) {
      callback({});
    }
    return Promise.resolve({});
  });
  
  chromeMock.storage.local.set.mockImplementation((data, callback) => {
    if (callback) {
      callback();
    }
    return Promise.resolve();
  });
  
  // Set up runtime mock
  chromeMock.runtime.sendMessage.mockImplementation((message, callback) => {
    if (callback) {
      callback({ success: true });
    }
    return Promise.resolve({ success: true });
  });
  
  // Make Chrome available globally
  global.chrome = chromeMock;
  
  console.log('✅ Chrome API mocks set up for testing');
});

// Reset Chrome API mocks after each test
afterEach(() => {
  if (global.chrome) {
    // Reset all mock functions
    Object.values(global.chrome).forEach(api => {
      if (api && typeof api === 'object') {
        Object.values(api).forEach(method => {
          if (method && typeof method === 'function' && method.mockReset) {
            method.mockReset();
          }
        });
      }
    });
  }
});

// Clean up Chrome API mocks after all tests
afterAll(() => {
  delete global.chrome;
  console.log('✅ Chrome API mocks cleaned up');
});
