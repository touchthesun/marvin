// extension/jest.config.js
const baseConfig = require('./jest.base.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'extension',
  // Add setup for MSW
  setupFiles: [
    '<rootDir>/tests/helpers/msw-setup.js'
  ],
  // Update transformIgnorePatterns for MSW v2
  transformIgnorePatterns: [
    'node_modules/(?!msw|@mswjs|@mswjs/cli|@mswjs/node|@mswjs/types)'
  ]
};