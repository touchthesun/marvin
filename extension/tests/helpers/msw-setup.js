// extension/tests/helpers/msw-setup.js
import { setupServer } from 'msw/node';
import { handlers } from '../__mocks__/handlers';

// Setup MSW server with error handling
const server = setupServer(...handlers);

// Start server before all tests
beforeAll(async () => {
  try {
    await server.listen({ onUnhandledRequest: 'warn' });
  } catch (error) {
    console.error('Failed to start MSW server:', error);
  }
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Close server after all tests
afterAll(async () => {
  try {
    await server.close();
  } catch (error) {
    console.error('Failed to close MSW server:', error);
  }
});