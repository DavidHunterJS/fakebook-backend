// src/__tests__/jest.setup.js
// This runs BEFORE any modules are loaded, ensuring environment variables are set early

// Set test environment variables that are required for the app to start
process.env.NODE_ENV = 'test';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test_google_client_id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test_google_client_secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || '12e7b872b07f96f6c3b3e02903767bfcf2fe699b8ce05d72e4663f6c5750a5ac';

// Set other required environment variables for testing
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test_access_key';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test_secret_key';
process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'test-bucket';

console.log('🧪 Jest setup: Environment variables configured for testing');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('GOOGLE_CLIENT_ID set:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET set:', !!process.env.GOOGLE_CLIENT_SECRET);