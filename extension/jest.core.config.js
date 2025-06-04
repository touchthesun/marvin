// jest.core.config.js
export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.test.config.js' }]
  },
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/tests/core/**/*.test.js'],
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage/core',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['./tests/setup/core.setup.js'],  // Changed from setupFiles to setupFilesAfterEnv
  testTimeout: 30000,
  maxWorkers: 1, // Run tests serially to avoid memory issues
  globals: {
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc'
  },
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'logs/test',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(module-that-needs-to-be-transformed)/)'
  ]
};