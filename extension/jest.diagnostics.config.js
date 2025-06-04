// extension/jest.diagnostics.config.js
module.exports = {
    displayName: 'extension-diagnostics',
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
      '@testing-library/jest-dom'
    ],
    transform: {
      '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { 
        presets: [
          ['@babel/preset-env', {
            targets: {
              node: 'current'
            }
          }],
          '@babel/preset-react',
          '@babel/preset-typescript'
        ]
      }]
    },
    transformIgnorePatterns: [
      'node_modules/(?!fast-glob)'
    ],
    testMatch: [
      '**/tests/diagnostics/**/*.test.{js,jsx,ts,tsx}'
    ],
    testPathIgnorePatterns: ['/node_modules/']
};