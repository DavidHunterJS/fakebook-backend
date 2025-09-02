// src/__tests__/user.test.ts
import request from 'supertest';
import { app } from '../app'; // Ensure this path is correct
import User from '../models/User'; // Ensure this path is correct

describe('User Profile API', () => {
  let agent: any;
  let userId: string;

  beforeEach(async () => {
    // Create agent to maintain session cookies
    agent = request.agent(app);

    const userPayload = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
    };

    // Register with agent
    const registrationResponse = await agent
      .post('/api/auth/register')
      .send(userPayload);

    // REVERTING to 201, as you correctly pointed out.
    expect(registrationResponse.status).toBe(201);

    const user = await User.findOne({ email: userPayload.email });
    if (!user) {
      throw new Error('Test setup failed: User was not created in the database.');
    }

    user.isEmailVerified = true;
    await user.save();
    userId = user.id;

    // Login with agent (automatically stores session cookies)
    const loginResponse = await agent
      .post('/api/auth/login')
      .send({ email: userPayload.email, password: userPayload.password });

    expect(loginResponse.status).toBe(200);
    // No token extraction needed - session is handled by agent
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 and the current user profile', async () => {
      // Use agent with session instead of Authorization header
      const response = await agent.get('/api/auth/me');

      expect(response.statusCode).toBe(200);
      console.log('API Response Body:', response.body);
      // We will leave the final expectation as-is for the moment.
      // The console.log above will tell us exactly how to fix this line.
      expect(response.body.user._id).toBe(userId);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should return 200 and update the user profile', async () => {
      const updatePayload = {
        firstName: 'UpdatedFirstName',
        bio: 'This is my new bio.',
      };

      // Use agent with session instead of Authorization header
      const response = await agent
        .put('/api/users/profile')
        .send(updatePayload);

      expect(response.statusCode).toBe(200);
      expect(response.body.firstName).toBe('UpdatedFirstName');
    });

    it('should return 400 for invalid data (bio too long)', async () => {
      const invalidPayload = { bio: 'a'.repeat(501) };

      // Use agent with session instead of Authorization header
      const response = await agent
        .put('/api/users/profile')
        .send(invalidPayload);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Auth Middleware', () => {
    it('should return 401 if no session is provided', async () => {
      // Use fresh request (no agent/session) to test unauthorized access
      const response = await request(app)
        .put('/api/users/profile')
        .send({ firstName: 'ShouldFail' });

      expect(response.statusCode).toBe(401);
    });
  });
});