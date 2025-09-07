export default {
  displayName: 'base',
  testEnvironment: 'jsdom',
  rootDir: './',
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  moduleDirectories: ['node_modules', 'src'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@background/(.*)$': '<rootDir>/src/background/$1',
    '^@content/(.*)$': '<rootDir>/src/content/$1',
    '^@constants/(.*)$': '<rootDir>/src/constants/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/__mocks__/fileMock.js'
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/msw-setup.js',
    '<rootDir>/tests/helpers/setup-environment.js',
    '@testing-library/jest-dom'
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.css',
    '!src/**/*.html',
    '!**/node_modules/**',
    '!src/**/*.d.ts'
  ],
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'html'],
  testMatch: [
    '**/tests/**/*.test.{js,jsx,ts,tsx}'
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  testTimeout: 30000,
  maxWorkers: 1,
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    },
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