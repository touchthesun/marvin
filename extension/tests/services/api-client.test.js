/**
 * API Client Test
 * 
 * Tests to verify that the API client can properly communicate with the FastAPI server.
 */

import { apiClient } from '../../src/background/api-client.js';

// Mock fetch for testing
global.fetch = jest.fn();

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.clearCache();
    apiClient.isServerAvailable = true;
  });

  describe('Server Connection', () => {
    test('should connect to FastAPI server at correct URL', async () => {
      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: 'test' })
      });

      const result = await apiClient.makeRequest('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:61697/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual({ success: true, data: 'test' });
    });

    test('should handle server unavailability gracefully', async () => {
      // Mock network error
      global.fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      await expect(apiClient.makeRequest('/api/test')).rejects.toThrow('Failed to fetch');
      expect(apiClient.isServerAvailable).toBe(false);
    });

    test('should serve cached data when server is unavailable', async () => {
      // First request - cache some data
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: 'cached data' })
      });

      await apiClient.makeRequest('/api/test');

      // Second request - server unavailable, should serve cached data
      global.fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      const result = await apiClient.makeRequest('/api/test');
      expect(result).toEqual({ success: true, data: 'cached data', _stale: true });
    });
  });

  describe('Authentication', () => {
    test('should include basic auth headers when credentials are set', async () => {
      apiClient.setAuthCredentials('testuser', 'testpass');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await apiClient.makeRequest('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Basic dGVzdHVzZXI6dGVzdHBhc3M=' // base64 encoded
          })
        })
      );
    });
  });

  describe('API Methods', () => {
    test('should call correct endpoints for getActiveTasks', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [] })
      });

      await apiClient.getActiveTasks();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:61697/api/tasks/active',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should call correct endpoints for captureUrl', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await apiClient.captureUrl('https://example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:61697/api/capture/url',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://example.com' })
        })
      );
    });

    test('should call correct endpoints for getKnowledgeData', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} })
      });

      await apiClient.getKnowledgeData('overview');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:61697/api/knowledge/overview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({})
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle HTTP errors properly', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(apiClient.makeRequest('/api/test')).rejects.toThrow('HTTP 404: Not Found');
    });

    test('should handle JSON parsing errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      await expect(apiClient.makeRequest('/api/test')).rejects.toThrow('Invalid JSON');
    });
  });
});
