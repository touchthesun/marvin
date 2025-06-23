// extension/jest.components.config.js
const baseConfig = require('./jest.base.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'components',
  testMatch: [
    '**/tests/components/**/*.test.{js,jsx,ts,tsx}'
  ]
};