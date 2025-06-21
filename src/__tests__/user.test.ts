import request from 'supertest';
import { app } from '../app';
import User from '../models/User';

describe('User Profile API', () => {
  // --- Test Suite Setup ---
  // Use the stable beforeAll pattern to set up state once.
  let token: string;
  let userId: string;

  beforeAll(async () => {
    // 1. Create a user
    const userPayload = {
      username: `profile_user_${Date.now()}`,
      email: `profile_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'Profile',
      lastName: 'User',
    };

    // --- Suggested Debugging Logs and Assertions for Registration ---
    console.log('user.test.ts: Attempting to register user:', userPayload.email);
    const registerResponse = await request(app).post('/api/auth/register').send(userPayload);
    console.log('user.test.ts: Register response status:', registerResponse.status);
    console.log('user.test.ts: Register response body:', registerResponse.body);
    // Crucial: Assert registration status immediately
    expect(registerResponse.status).toBe(201); // Assuming 201 Created on successful registration
    // --- End Debugging Logs for Registration ---


    // 2. Manually verify the user to ensure login is not blocked
    // --- Suggested Debugging Logs and Assertions for Verification ---
    console.log('user.test.ts: Attempting to manually verify user:', userPayload.email);
    const updateResult = await User.updateOne({ email: userPayload.email }, { $set: { isVerified: true } });
    console.log('user.test.ts: User verification update result (modifiedCount):', updateResult.modifiedCount);
    // Crucial: Assert that the user was actually found and modified
    expect(updateResult.modifiedCount).toBe(1);

    // Fetch the user directly to confirm verification status right before login
    const verifiedUser = await User.findOne({ email: userPayload.email });
    console.log('user.test.ts: Fetched user after verification (isVerified):', verifiedUser ? verifiedUser.isEmailVerified : 'User not found for verification check');
    expect(verifiedUser).not.toBeNull();
    expect(verifiedUser?.isEmailVerified).toBe(true);
    // --- End Debugging Logs for Verification ---


    // 3. Log in to get a valid token
    // --- Suggested Debugging Logs for Login ---
    console.log('user.test.ts: Attempting to log in user:', userPayload.email);
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: userPayload.email, password: userPayload.password });

    console.log('user.test.ts: Login response status:', loginResponse.status);
    console.log('user.test.ts: Login response body:', loginResponse.body);
    // --- End Debugging Logs for Login ---


    // Ensure login is successful before running tests
    expect(loginResponse.status).toBe(200);

    token = loginResponse.body.token;
    userId = loginResponse.body.user.id;
    console.log('user.test.ts: Login successful. Token exists:', !!token, 'UserId:', userId);
  });

  // --- Test Cases ---

  describe('GET /api/auth/me', () => {
    it('should return 200 and the current user profile for a valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.user.id).toBe(userId);
      expect(response.body.user).not.toHaveProperty('password');
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should return 200 and update the user profile with valid data', async () => {
      const updatePayload = {
        firstName: 'UpdatedFirstName',
        bio: 'This is my new bio.',
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(updatePayload);

      expect(response.statusCode).toBe(200);
      expect(response.body.firstName).toBe('UpdatedFirstName');
      expect(response.body.bio).toBe('This is my new bio.');

      const updatedUser = await User.findById(userId);
      expect(updatedUser?.firstName).toBe('UpdatedFirstName');
    });

    it('should return 400 Bad Request for invalid data (e.g., bio too long)', async () => {
      const invalidPayload = {
        bio: 'a'.repeat(501), // Assuming max length is 500
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidPayload);

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({ firstName: 'ShouldFail' });

      expect(response.statusCode).toBe(401);
    });
  });
});