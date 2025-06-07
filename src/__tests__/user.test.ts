// src/__tests__/user.test.ts
import request from 'supertest';
import { app } from '../app'; // Adjust path if needed

describe('GET /api/auth/me - Get User Profile', () => {
  let token: string;
  let userId: string;

  // Test user credentials
  const testUser = {
    username: `profile_tester_${Date.now()}`,
    email: `profile_${Date.now()}@example.com`,
    password: 'Password123!',
    firstName: 'Profile',
    lastName: 'Tester',
  };

  // Before running the tests in this suite, we need a logged-in user.
  // We'll register and then log in to get a valid token.
  beforeAll(async () => {
    // First, register the user
    await request(app).post('/api/auth/register').send(testUser);

    // Then, log the user in to get the token
    const response = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });

    token = response.body.token; // Save the token for authenticated requests
    userId = response.body.user.id; // Save the user ID for assertions
  });

  it('should return 200 and the current user profile for a valid token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      // This is the key part for authenticated requests:
      // We set the Authorization header with the token.
      .set('Authorization', `Bearer ${token}`);

    // Assert a successful response
    expect(response.statusCode).toBe(200);

    // Assert that the response body contains the correct user data
    expect(response.body).toHaveProperty('_id', userId);
    expect(response.body).toHaveProperty('email', testUser.email);
    expect(response.body).toHaveProperty('username', testUser.username);
    // Ensure the password is not sent back
    expect(response.body).not.toHaveProperty('password');
  });

  it('should return 401 Unauthorized if no token is provided', async () => {
    // Make the request without the Authorization header
    const response = await request(app).get('/api/auth/me');

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toMatch(/no token/i);
  });

  it('should return 401 Unauthorized for a malformed or invalid token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalidtoken123'); // Use a fake token

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toMatch(/token is not valid/i);
  });
});
