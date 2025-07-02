export default {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/components/popup.test.js'],
    setupFilesAfterEnv: [],
    transform: {
      '^.+\\.js$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
    },
    moduleFileExtensions: ['js', 'json'],
    moduleNameMapper: {
      '\\.(css|less|scss)$': '<rootDir>/tests/__mocks__/styleMock.js'
    },
    testTimeout: 10000,
    verbose: true,
    collectCoverage: false,
  };