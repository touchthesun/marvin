import { http, HttpResponse } from 'msw';

export const handlers = [
  // Example API handler
  http.get('*/api/example', () => {
    return HttpResponse.json({
      data: {
        id: 1,
        name: 'Example Response'
      }
    });
  }),

  // Add more handlers as needed for your API endpoints
  http.post('*/api/example', () => {
    return HttpResponse.json({
      success: true,
      message: 'Example POST response'
    });
  })
];