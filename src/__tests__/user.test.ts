// src/__tests__/user.test.ts
import request from 'supertest';
import { app } from '../app';
import User from '../models/User';

describe('User Profile API', () => {
  let agent: any;
  let userId: string;
  let userEmail: string;
  let authToken: string; // Add token storage if using JWT

  beforeEach(async () => {
    // Create a new agent that maintains cookies
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
    const registerResponse = await agent
      .post('/api/auth/register')
      .send(userPayload);

    // Manually find and verify the user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      throw new Error('Test setup failed: User not found after registration.');
    }
    
    user.isEmailVerified = true;
    await user.save();
    userId = user.id;

    // Log in to establish the session
    const loginResponse = await agent
      .post('/api/auth/login')
      .send({ 
        email: userPayload.email, 
        password: userPayload.password 
      });

    // Debug: Check if login was successful
    console.log('Login response status:', loginResponse.status);
    console.log('Login response headers:', loginResponse.headers);
    
    // If your app uses JWT tokens, extract and store the token
    if (loginResponse.headers['set-cookie']) {
      console.log('Cookies set:', loginResponse.headers['set-cookie']);
    }
    
    // If using JWT in response body, store it
    if (loginResponse.body.token) {
      authToken = loginResponse.body.token;
    }

    // Ensure login was successful
    expect(loginResponse.status).toBe(200);
  });

  describe('GET /api/auth/me', () => {
    it('should return 200 and the current user profile', async () => {
      let request = agent.get('/api/auth/me');
      
      // If using JWT token in Authorization header
      if (authToken) {
        request = request.set('Authorization', `Bearer ${authToken}`);
      }
      
      const response = await request;

      // Debug: Log the response for troubleshooting
      console.log('GET /api/auth/me response status:', response.status);
      console.log('GET /api/auth/me response body:', response.body);

      // Assertions
      expect(response.statusCode).toBe(200);
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

      let request = agent.put('/api/users/profile').send(updatePayload);
      
      // If using JWT token in Authorization header
      if (authToken) {
        request = request.set('Authorization', `Bearer ${authToken}`);
      }

      const response = await request;

      // Debug logging
      console.log('PUT /api/users/profile response status:', response.status);
      console.log('PUT /api/users/profile response body:', response.body);

      // Assertions
      expect(response.statusCode).toBe(200);
      expect(response.body.firstName).toBe('UpdatedFirstName');
      expect(response.body.bio).toBe('This is my new bio.');
    });

    it('should return 400 for invalid data (bio too long)', async () => {
      const invalidPayload = { bio: 'a'.repeat(501) };
      
      let request = agent.put('/api/users/profile').send(invalidPayload);
      
      // If using JWT token in Authorization header
      if (authToken) {
        request = request.set('Authorization', `Bearer ${authToken}`);
      }

      const response = await request;

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