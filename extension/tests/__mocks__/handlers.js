import { rest } from 'msw';

export const handlers = [
  // Example API handler
  rest.get('*/api/example', (req, res, ctx) => {
    return res(
      ctx.json({
        data: {
          id: 1,
          name: 'Example Response'
        }
      })
    );
  }),

  // Add more handlers as needed for your API endpoints
  rest.post('*/api/example', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        message: 'Example POST response'
      })
    );
  })
];