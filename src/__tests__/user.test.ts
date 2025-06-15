// src/__tests__/user.test.ts
import request from 'supertest';
import { app } from '../app'; // Adjust path if needed

describe('User Profile API', () => {
  let token: string;
  let userId: string;

  // This hook now creates a fresh, valid user before each test.
  beforeEach(async () => {
    const userCredentials = {
      username: `profile_update_tester_${Date.now()}`,
      email: `profile_update_${Date.now()}@example.com`,
      password: 'Password123!',
      firstName: 'OriginalFirst',
      lastName: 'OriginalLast',
    };
    
    // Step 1: Register the user
    const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userCredentials);
    
    // Add a check to ensure registration was successful
    if (registerResponse.statusCode !== 201) {
        console.error('Failed to register user in beforeEach:', registerResponse.body);
    }
    expect(registerResponse.statusCode).toBe(201);

    // Step 2: Log the user in
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: userCredentials.email,
      password: userCredentials.password,
    });
    
    // Add a check to ensure login was successful
    if (loginResponse.statusCode !== 200) {
        console.error('Failed to log in user in beforeEach:', loginResponse.body);
    }
    expect(loginResponse.statusCode).toBe(200);

    // Now it is safe to access the response body
    token = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });

  // --- Test Suite for GET /api/auth/me ---
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

      expect(response.statusCode).toBe(200);
      expect(response.body.firstName).toBe('UpdatedFirst');
      expect(response.body.bio).toBe('This is my new bio.');
    });

    it('should return 400 Bad Request for invalid data (e.g., bio too long)', async () => {
      const invalidUpdate = { bio: 'a'.repeat(501) };
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidUpdate);

      expect(response.statusCode).toBe(400);
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
