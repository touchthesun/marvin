export default {
  displayName: 'dashboard',
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/components/dashboard.test.js'],
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/setup-environment.js',
    '<rootDir>/tests/helpers/setup-globals.js'
  ],
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
  },
  moduleFileExtensions: ['js', 'json'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@background/(.*)$': '<rootDir>/src/background/$1',
    '^@content/(.*)$': '<rootDir>/src/content/$1',
    '^@constants/(.*)$': '<rootDir>/src/constants/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/__mocks__/fileMock.js'
  },
  testTimeout: 30000, // Longer timeout for dashboard complexity
  verbose: true,
  collectCoverage: false, // Start without coverage, add later
  maxWorkers: 1, // Single worker for dashboard tests to avoid conflicts
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  globals: {
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc'
  },
  reporters: [
    ['default', { silent: false, verbose: true }],
    ['jest-junit', {
      outputDirectory: 'logs/test',
      outputName: 'dashboard-junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ]
}; 