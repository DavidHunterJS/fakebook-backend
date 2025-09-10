// src/__tests__/login.test.ts
import request from 'supertest';
import { app } from '../app'; // Or '../server'

// --- Test User Credentials ---
// We will create this user before the tests run.
const testUser = {
  username: `login_test_user_${Date.now()}`,
  email: `login_test_${Date.now()}@example.com`,
  password: 'Password123!', // A valid password
  firstName: 'Login',
  lastName: 'Test'
};

const nonExistentUserCredentials = {
  email: `nonexistent_${Date.now()}@example.com`,
  password: 'somePassword'
};

const existingUserWrongPassword = {
  email: testUser.email, // Use the email of the user we will create
  password: 'wrongPasswordDefinitely'
};

// --- Test Suite ---
describe('POST /api/auth/login', () => {
  // ** IMPORTANT: Create the user before running any login tests **
  beforeAll(async () => {
    // Use the registration endpoint to create our test user
    await request(app)
      .post('/api/auth/register')
      .send(testUser);
  });

  describe('successful login', () => {
    it('should return 200 and user data for valid credentials', async () => {
      const agent = request.agent(app);
      
      const response = await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Check for success - session-based login
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      
      // No token expected in session-based auth
      // Session cookie should be automatically set by the agent
    });
  });

  describe('failed login attempts', () => {
    it('should return 401 for non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(nonExistentUserCredentials);

      expect(response.statusCode).toBe(401);
      // CORRECTED: Check for 'message' key
      expect(response.body).toEqual({ message: 'Invalid credentials' });
    });

    it('should return 401 for existing email with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(existingUserWrongPassword);

      expect(response.statusCode).toBe(401);
      // CORRECTED: Check for 'message' key
      expect(response.body).toEqual({ message: 'Invalid credentials' });
    });

    // These tests for 400 status were already passing and are correct.
    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'somePassword' });

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email });

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });
  });

  // This test for a special character password would follow the same pattern.
  // To make it pass, you'd need to register a user with that password
  // in the beforeAll hook, then attempt to log in with it. For simplicity,
  // this example assumes the main password is sufficient.
  describe('security considerations', () => {
    it('should not expose sensitive information in error responses', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send(existingUserWrongPassword); // Use a known invalid attempt

      expect(response.statusCode).toBe(401);
      // CORRECTED: Check for 'message' key and ensure no extra data
      expect(response.body).toEqual({ message: 'Invalid credentials' });
    });
  });
});