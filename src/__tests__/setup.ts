// src/__tests__/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // Environment variables are now set in jest.setup.js
  console.log('🔧 Setting up test database...');
  
  try {
    // Create in-memory MongoDB instance
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    
    // Connect to the in-memory database
    await mongoose.connect(uri);
    console.log('✅ Connected to in-memory MongoDB for testing');
  } catch (error) {
    console.error('❌ Failed to connect to in-memory MongoDB:', error);
    throw error;
  }
}, 30000); // 30 second timeout for setup

afterAll(async () => {
  try {
    console.log('🧹 Cleaning up test database...');
    
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
    
    console.log('✅ Disconnected from in-memory MongoDB');
  } catch (error) {
    console.error('❌ Error during test cleanup:', error);
  }
}, 30000);

// Handle any unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});