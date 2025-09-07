import baseConfig from './jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'Dashboard Component Loading Tests',
  testMatch: [
    '**/tests/dashboard-component-loading.test.js'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/dashboard-setup.js'
  ],
  testEnvironment: 'jsdom',
  verbose: true
};
