// jest.config.js
module.exports = {
  // 'dotenv/config' should be sufficient here to load from .env files during local development.
  // For CI, Jenkins will set process.env directly.
  setupFiles: ['dotenv/config'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  modulePathIgnorePatterns: ['<rootDir>/dist/'],

  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/server.ts' // Exclude server startup from coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000, // 30 second timeout
  verbose: true,
  // Handle ES modules if needed
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  // Ignore node_modules except for packages that need transpilation
  transformIgnorePatterns: [
    'node_modules/(?!(mongodb-memory-server)/)'
  ]
};