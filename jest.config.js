// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // ** ADDED THIS LINE **
  // A list of paths to directories that Jest should NOT search for files in.
  // This prevents the "duplicate manual mock" warning by ignoring the compiled JS output from 'tsc'.
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

// Add to package.json (devDependencies section)
/*
"devDependencies": {
  "@types/jest": "^29.5.0",
  "@types/supertest": "^6.0.0",
  "jest": "^29.5.0",
  "mongodb-memory-server": "^8.12.0",
  "supertest": "^6.3.0",
  "ts-jest": "^29.1.0"
}
*/

// Add to package.json (scripts section)
/*
"scripts": {
  "test": "NODE_ENV=test jest --runInBand",
  "test:watch": "NODE_ENV=test jest --watch",
  "test:coverage": "NODE_ENV=test jest --coverage",
  "test:verbose": "NODE_ENV=test jest --verbose"
}
*/
