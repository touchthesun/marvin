// jest.core.config.js
export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.test.config.cjs' }]
  },
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/tests/core/**/*.test.js'],
  verbose: false,
  silent: false,
  collectCoverage: true,
  coverageDirectory: 'coverage/core',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['./tests/setup/core.setup.js','./tests/helpers/setup-globals.js'],
  testTimeout: 30000,
  maxWorkers: 1, // Run tests serially to avoid memory issues
  globals: {
    'NODE_OPTIONS': '--max-old-space-size=4096 --expose-gc'
  },
  reporters: [
    ['default', {
      silent: false,
      verbose: false
    }],
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
    'node_modules/(?!(d3|d3-[^/]+|internmap|delaunator|robust-predicates|@observablehq|@dagrejs|@floating-ui|@newdash|@popperjs|@swc|@visx|@vx|@babel|msw|@mswjs|@mswjs/cli|@mswjs/node|@mswjs/types)/)'
  ]
};