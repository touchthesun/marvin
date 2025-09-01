// extension/jest.utils.config.mjs
import baseConfig from './jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'utils',
  
  // Utils-specific test matching
  testMatch: [
    '**/tests/utils/**/*.test.js',
    '**/tests/utils/**/*.test.mjs'
  ],
  
  // Utils-specific coverage collection
  collectCoverageFrom: [
    'src/utils/**/*.{js,jsx}',
    '!src/utils/**/*.css',
    '!src/utils/**/*.html',
    '!**/node_modules/**',
    '!src/utils/**/*.d.ts'
  ],
  
  // Utils-specific coverage directory
  coverageDirectory: 'coverage/utils',
  
  // Utils-specific setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/setup-environment.js',
    '<rootDir>/tests/helpers/setup-globals.js',
    '@testing-library/jest-dom'
  ],
  
  // Utils-specific test timeout
  testTimeout: 30000,
  
  // Utils-specific max workers
  maxWorkers: 1,
  
  // Utils-specific globals
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    },
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc',
    // Utils-specific globals
    'UTILS_TEST_MODE': 'true',
    'ENABLE_UTILS_LOGGING': 'false'
  },
  
  // Utils-specific reporters
  reporters: [
    ['default', { 
      silent: false, 
      verbose: false 
    }],
    ['jest-junit', {
      outputDirectory: 'logs/test',
      outputName: 'utils-junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  
  // Utils-specific test environment options
  testEnvironmentOptions: {
    url: 'http://localhost',
    // Utils-specific environment variables
    customExportConditions: ['node', 'development']
  },
  
  // Utils-specific module name mapping
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // Add utils-specific mappings
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    // Mock external dependencies that utils might use
    '^chrome$': '<rootDir>/tests/__mocks__/chrome-api.js'
  },
  
  // Utils-specific transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!chrome-extension-mock)'
  ],
  
  // Utils-specific test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test-results/',
    '/logs/',
    '/coverage/',
    '/dist/'
  ],
  
  // Utils-specific watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Utils-specific module file extensions
  moduleFileExtensions: ['js', 'jsx', 'json', 'mjs'],
  
  // Utils-specific test runner
  testRunner: 'jest-circus/runner',
  
  // Utils-specific verbose output
  verbose: true,
  
  // Utils-specific collect coverage
  collectCoverage: true,
  
  // Utils-specific coverage thresholds
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    },
    './src/utils/': {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  
  // Utils-specific coverage reporters
  coverageReporters: [
    'json',
    'lcov', 
    'text', 
    'clover', 
    'html',
    'text-summary'
  ],
  
  // Utils-specific error on coverage threshold
  errorOnDeprecated: true,
  
  // Utils-specific force exit
  forceExit: true,
  
  // Utils-specific detect open handles
  detectOpenHandles: true,
  
  // Fix: Use correct Babel config file
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
  }
};
