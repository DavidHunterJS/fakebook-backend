// src/__tests__/user.test.ts - Fixed for session cookies
import request from 'supertest';
import { app } from '../app';
import User from '../models/User';

describe('User Profile API', () => {
  let agent: any; // Use agent to maintain cookies across requests
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    // Create agent that maintains cookies
    agent = request.agent(app);
    
    const userPayload = {
      username: `profileuser_${Date.now()}`,
      email: `profile_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
    };
    
    userEmail = userPayload.email;

    // Register the user
    await agent.post('/api/auth/register').send(userPayload);

    // Manually find and verify the user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      throw new Error('Test setup failed: User not found after registration.');
    }
    
    user.isEmailVerified = true;
    await user.save();
    userId = user.id;

    // Log in to establish session
    const loginResponse = await agent
      .post('/api/auth/login')
      .send({ 
        email: userPayload.email, 
        password: userPayload.password 
      });

    // Debug: Check if session cookies are now being set
    console.log('Login response status:', loginResponse.status);
    if (loginResponse.headers['set-cookie']) {
      console.log('✅ Session cookies set:', loginResponse.headers['set-cookie']);
    } else {
      console.log('❌ No session cookies - check session config');
    }

    // Ensure login was successful
    expect(loginResponse.status).toBe(200);
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 and the current user profile', async () => {
      const response = await agent.get('/api/auth/me');

      // Debug: Log the complete response structure
      console.log('GET /api/auth/me response status:', response.status);
      console.log('GET /api/auth/me complete response body:', JSON.stringify(response.body, null, 2));
      console.log('Response body keys:', Object.keys(response.body));

      // Check if user data is nested
      if (response.body.user) {
        console.log('User object found at response.body.user:', response.body.user);
        console.log('User object keys:', Object.keys(response.body.user));
      }

      // Assertions - adjust based on your actual response structure
      expect(response.statusCode).toBe(200);
      
      // Try different possible response structures:
      const userIdFromResponse = response.body._id || response.body.id || response.body.user?._id || response.body.user?.id;
      const emailFromResponse = response.body.email || response.body.user?.email;
      
      console.log('Extracted user ID:', userIdFromResponse);
      console.log('Extracted email:', emailFromResponse);
      
      expect(userIdFromResponse).toBe(userId);
      expect(emailFromResponse).toBe(userEmail);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should return 200 and update the user profile', async () => {
      const updatePayload = {
        firstName: 'UpdatedFirstName',
        lastName: 'UpdatedLastName',
        bio: 'This is my new bio.',
      };

      const response = await agent
        .put('/api/users/profile')
        .send(updatePayload);

      // Debug logging
      if (response.status !== 200) {
        console.log('PUT /api/users/profile response status:', response.status);
        console.log('PUT /api/users/profile response body:', response.body);
      }

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