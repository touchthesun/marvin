module.exports = {
  displayName: 'extension',
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
    // Handle static assets
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/__mocks__/fileMock.js'
  },
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/setup-environment.js',
    '@testing-library/jest-dom'
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { 
      presets: [
        '@babel/preset-env',
        '@babel/preset-react',
        '@babel/preset-typescript'
      ]
    }]
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
  // Add globals for TypeScript
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  // Add setup for MSW
  setupFiles: [
    '<rootDir>/tests/helpers/msw-setup.js'
  ],
  // Add transformIgnorePatterns to handle MSW
  transformIgnorePatterns: [
    'node_modules/(?!msw|@mswjs)'
  ]
};