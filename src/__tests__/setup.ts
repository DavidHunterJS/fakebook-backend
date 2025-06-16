// src/__tests__/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // Set NODE_ENV to test to prevent real DB connection in your server.ts
  process.env.NODE_ENV = 'test';
  
  try {
    // Create in-memory MongoDB instance
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(uri);
    
    console.log('Connected to in-memory MongoDB for testing');
  } catch (error) {
    console.error('Failed to connect to in-memory MongoDB:', error);
    throw error;
  }
}, 30000); // 30 second timeout for setup

afterAll(async () => {
  try {
    // Drop the database
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    
    // Close mongoose connection
    await mongoose.connection.close();
    
    // Stop the in-memory MongoDB instance
    if (mongod) {
      await mongod.stop();
    }
    
    console.log('Disconnected from in-memory MongoDB');
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
}, 30000);

// Clean up data between tests (optional - keeps tests isolated)
afterEach(async () => {
  try {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
});

// Handle any unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

// package.json - Add these dependencies and scripts
/*
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/supertest": "^2.0.12",
    "jest": "^29.5.0",
    "mongodb-memory-server": "^8.12.0",
    "supertest": "^6.3.0",
    "ts-jest": "^29.1.0"
  },
  "scripts": {
    "test": "NODE_ENV=test jest",
    "test:watch": "NODE_ENV=test jest --watch",
    "test:coverage": "NODE_ENV=test jest --coverage"
  }
}
*/

// jest.config.js

// module.exports = {
//   preset: 'ts-jest',
//   testEnvironment: 'node',
//   setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
//   testMatch: ['**/__tests__/**/*.test.ts'],
//   collectCoverageFrom: [
//     'src/**/*.ts',
//     '!src/**/*.d.ts',
//     '!src/__tests__/**',
//     '!src/server.ts' // Exclude server.ts from coverage if needed
//   ],
//   coverageDirectory: 'coverage',
//   coverageReporters: ['text', 'lcov', 'html'],
//   testTimeout: 30000, // 30 second timeout for all tests
//   // If you're using ES modules
//   extensionsToTreatAsEsm: ['.ts'],
//   globals: {
//     'ts-jest': {
//       useESM: true
//     }
//   }
// };
