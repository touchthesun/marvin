// extension/jest.integration.config.mjs
import baseConfig from './jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'integration',
  testEnvironment: 'jsdom',
  testMatch: [
    '**/tests/integration/**/*.test.{js,jsx,ts,tsx}'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/setup-environment.js',
    '<rootDir>/tests/helpers/setup-globals.js'
  ],
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.test.config.cjs' }],
    '^.+\\.ts$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
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
  transformIgnorePatterns: [
    'node_modules/(?!(msw|d3|d3-.*|internmap|delaunator|robust-predicates|d3-array|d3-axis|d3-brush|d3-chord|d3-color|d3-contour|d3-delaunay|d3-dispatch|d3-drag|d3-dsv|d3-ease|d3-fetch|d3-force|d3-format|d3-geo|d3-hierarchy|d3-interpolate|d3-path|d3-polygon|d3-quadtree|d3-random|d3-scale|d3-scale-chromatic|d3-selection|d3-shape|d3-time|d3-time-format|d3-timer|d3-transition|d3-zoom)/)'
  ],
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false,
  maxWorkers: 1,
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  globals: {
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc'
  },
  coverageDirectory: 'coverage/integration',
  reporters: [
    ['default', { silent: false, verbose: true }],
    ['jest-junit', {
      outputDirectory: 'logs/test',
      outputName: 'integration-junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ]
};