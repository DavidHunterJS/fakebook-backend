// src/__tests__/user.test.ts
import request from 'supertest';
import { app } from '../app'; // Adjust path if needed

describe('User Profile API', () => {
  let token: string;
  let userId: string;

  // --- Test User Setup ---
  // A fresh user is created and logged in before each test in this suite.
  beforeEach(async () => {
    const userCredentials = {
      username: `profile_update_tester_${Date.now()}`,
      email: `profile_update_${Date.now()}@example.com`,
      password: 'Password123!',
      firstName: 'OriginalFirst',
      lastName: 'OriginalLast',
    };
    await request(app).post('/api/auth/register').send(userCredentials);
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: userCredentials.email,
      password: userCredentials.password,
    });
    token = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });

  // --- Test Suite for GET /api/auth/me ---
  // (We'll keep the previous successful test here for completeness)
  describe('GET /api/auth/me', () => {
    it('should return 200 and the current user profile for a valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('_id', userId);
    });
  });

  // --- Test Suite for PUT /api/users/profile ---
  describe('PUT /api/users/profile', () => {
    it('should return 200 and update the user profile with valid data', async () => {
      const profileUpdates = {
        firstName: 'UpdatedFirst',
        bio: 'This is my new bio.',
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(profileUpdates);

      // Assert a successful response
      expect(response.statusCode).toBe(200);

      // Assert that the returned user object reflects the changes
      expect(response.body.firstName).toBe('UpdatedFirst');
      expect(response.body.bio).toBe('This is my new bio.');
      // Ensure other data, like lastName, was not changed
      expect(response.body.lastName).toBe('OriginalLast');
    });

    it('should return 400 Bad Request for invalid data (e.g., bio too long)', async () => {
      const invalidUpdate = {
        // Create a string that is longer than the 500-character limit
        bio: 'a'.repeat(501),
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidUpdate);

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('errors');
      // Check that the error message is for the 'bio' field
      expect(response.body.errors[0].path).toBe('bio');
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({ firstName: 'ShouldFail' });

      expect(response.statusCode).toBe(401);
    });
  });
});
