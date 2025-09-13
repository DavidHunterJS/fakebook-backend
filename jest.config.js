// jest.config.js
module.exports = {
  // Load environment variables first, before anything else
  setupFiles: [
    'dotenv/config',
    '<rootDir>/src/__tests__/jest.setup.js'  // Create this new file
  ],
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'], // Keep your existing setup
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