// tests/helpers/setup-environment.js
import { createMockSystem } from '../utils/mock-system.js';

// Create a global mock system for all tests
const mockSystem = createMockSystem();

// Make it available globally
global.mockSystem = mockSystem;

// Set up test environment
beforeEach(async () => {
  await mockSystem.reset();
});

afterEach(async () => {
  await mockSystem.reset();
});