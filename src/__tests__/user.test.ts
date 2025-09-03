// src/__tests__/user.test.ts
import request from 'supertest';
import { app } from '../app'; // Ensure this path is correct
import User from '../models/User'; // Ensure this path is correct

describe('User Profile API', () => {
  // Use SuperAgentTest for type safety with the agent
  let agent: any;
  let userId: string;
  let userEmail: string;

  // Before each test, create a fresh user and log in to get an authenticated agent
  beforeEach(async () => {
    agent = request.agent(app); // Create a new agent to handle cookies for each test

    const userPayload = {
      username: `profileuser_${Date.now()}`,
      email: `profile_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
    };
    userEmail = userPayload.email; // Store email for assertions

    // Register the user
    await agent.post('/api/auth/register').send(userPayload);

    // Manually find and verify the user to ensure a clean state
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      throw new Error('Test setup failed: User not found after registration.');
    }
    user.isEmailVerified = true;
    await user.save();
    userId = user.id; // Store the user ID

    // Log in to establish the session on the agent
    await agent
      .post('/api/auth/login')
      .send({ email: userPayload.email, password: userPayload.password });
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 and the current user profile', async () => {
      // Use the authenticated agent to make the request
      const response = await agent.get('/api/auth/me');

      // Assertions
      expect(response.statusCode).toBe(200);
      // **FIX:** Expect the user object directly on the body, not nested.
      expect(response.body._id).toBe(userId);
      expect(response.body.email).toBe(userEmail);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should return 200 and update the user profile', async () => {
      const updatePayload = {
        firstName: 'UpdatedFirstName',
        lastName: 'UpdatedLastName',
        bio: 'This is my new bio.',
      };

      // Use the authenticated agent to update the profile
      const response = await agent
        .put('/api/users/profile')
        .send(updatePayload);

      // Assertions
      expect(response.statusCode).toBe(200);
      expect(response.body.firstName).toBe('UpdatedFirstName');
      expect(response.body.bio).toBe('This is my new bio.');
    });

    it('should return 400 for invalid data (bio too long)', async () => {
      const invalidPayload = { bio: 'a'.repeat(501) };

      const response = await agent
        .put('/api/users/profile')
        .send(invalidPayload);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Auth Middleware', () => {
    it('should return 401 if no session is provided', async () => {
      // Use a fresh, unauthenticated request to test the middleware
      const response = await request(app).get('/api/auth/me');

      expect(response.statusCode).toBe(401);
    });
  });
});
