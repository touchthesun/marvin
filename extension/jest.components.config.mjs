// extension/jest.components.config.js
import baseConfig from './jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'components',
  testMatch: [
    '**/tests/components/**/*.test.{js,jsx,ts,tsx}'
  ],
  coverageDirectory: 'coverage/components'
};