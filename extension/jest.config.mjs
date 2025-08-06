import baseConfig from './jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'extension',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
  },
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/tests/**/*.test.js'],
  verbose: false,
  silent: false,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/msw-setup.js'
  ],
  testTimeout: 30000,
  maxWorkers: 1,
  globals: {
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc'
  },
  reporters: [
    ['default', { silent: false, verbose: false }],
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
    'node_modules/(?!msw|@mswjs|@mswjs/cli|@mswjs/node|@mswjs/types)'
  ]
};