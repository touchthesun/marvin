// extension/tests/services/api-service.test.js
import { ApiService } from '../../src/services/api-service';
import { server } from '../../tests/helpers/msw-setup';
import { http, HttpResponse } from 'msw';

describe('ApiService', () => {
  let apiService;

  beforeEach(() => {
    apiService = new ApiService();
  });

  test('initializes correctly', () => {
    expect(apiService).toBeDefined();
    expect(apiService.initialized).toBeFalsy();
  });

  test('handles API requests', async () => {
    // Mock API response
    server.use(
      http.get('*/api/test', () => {
        return HttpResponse.json({ data: 'test response' });
      })
    );

    const response = await apiService.get('/api/test');
    expect(response.data).toBe('test response');
  });

  test('handles API errors', async () => {
    // Mock API error
    server.use(
      http.get('*/api/error', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    await expect(apiService.get('/api/error')).rejects.toThrow();
  });
});