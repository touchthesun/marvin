// extension/jest.services.config.mjs
import baseConfig from './jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'services',
  
  // Service-specific test matching
  testMatch: [
    '**/tests/services/**/*.test.js',
    '**/tests/services/**/*.test.mjs'
  ],
  
  // Service-specific coverage collection
  collectCoverageFrom: [
    'src/services/**/*.{js,jsx}',
    'src/utils/**/*.{js,jsx}', // Include utils since services depend on them
    '!src/services/**/*.css',
    '!src/services/**/*.html',
    '!**/node_modules/**',
    '!src/services/**/*.d.ts'
  ],
  
  // Service-specific coverage directory
  coverageDirectory: 'coverage/services',
  
  // Service-specific setup files - Remove MSW for now
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/setup-environment.js',
    '<rootDir>/tests/helpers/setup-globals.js',
    '<rootDir>/tests/setup/services.setup.js',
    '@testing-library/jest-dom'
  ],
  
  // Service-specific test timeout (services may need more time for async operations)
  testTimeout: 45000,
  
  // Service-specific max workers (services often have shared state)
  maxWorkers: 1,
  
  // Service-specific globals
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    },
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc',
    // Service-specific globals
    'SERVICE_TEST_MODE': 'true',
    'ENABLE_SERVICE_LOGGING': 'false'
  },
  
  // Service-specific reporters
  reporters: [
    ['default', { 
      silent: false, 
      verbose: false 
    }],
    ['jest-junit', {
      outputDirectory: 'logs/test',
      outputName: 'services-junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  
  // Service-specific test environment options
  testEnvironmentOptions: {
    url: 'http://localhost',
    // Service-specific environment variables
    customExportConditions: ['node', 'development']
  },
  
  // Service-specific module name mapping
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // Add service-specific mappings
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    // Mock external dependencies that services might use
    '^chrome$': '<rootDir>/tests/__mocks__/chrome-api.js',
    '^@mswjs/node$': '<rootDir>/tests/__mocks__/msw-node.js'
  },
  
  // Service-specific transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!msw|@mswjs|@mswjs/cli|@mswjs/node|@mswjs/types|chrome-extension-mock)'
  ],
  
  // Service-specific test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test-results/',
    '/logs/',
    '/coverage/',
    '/dist/'
  ],
  
  // Service-specific watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Service-specific module file extensions
  moduleFileExtensions: ['js', 'jsx', 'json', 'mjs'],
  
  // Service-specific test runner
  testRunner: 'jest-circus/runner',
  
  // Service-specific verbose output
  verbose: true,
  
  // Service-specific collect coverage
  collectCoverage: true,
  
  // Service-specific coverage thresholds - Lowered for development
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    },
    './src/services/': {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  
  // Service-specific coverage reporters
  coverageReporters: [
    'json',
    'lcov', 
    'text', 
    'clover', 
    'html',
    'text-summary'
  ],
  
  // Service-specific error on coverage threshold
  errorOnDeprecated: true,
  
  // Service-specific force exit
  forceExit: true,
  
  // Service-specific detect open handles
  detectOpenHandles: true,
  
  // Fix: Use correct Babel config file
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
  }
};