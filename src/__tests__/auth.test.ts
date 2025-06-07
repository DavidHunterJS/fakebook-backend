// src/__tests__/auth.test.ts
import request from 'supertest';
import { app } from '../app'; // Updated import path
// Import your User model for database verification (optional)
// import User from '../models/User';

// --- Test Data ---
const validUserData = {
  username: `testuser_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: 'Password1!',
  firstName: `First_${Date.now()}`,
  lastName: `Last_${Date.now()}`
};

const invalidUserDataMissingEmail = {
  username: 'testuser_no_email',
  password: 'Password1!',
  firstName: 'Test',
  lastName: 'User'
};

const invalidUserDataMissingPassword = {
  username: 'testuser_no_password',
  email: 'no_password@example.com',
  firstName: 'Test',
  lastName: 'User'
};

describe('POST /api/auth/register - User Registration', () => {
  
  it('should register a new user successfully with valid data', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(validUserData);

    // Based on your JWT response structure
    expect(response.statusCode).toBe(201);
    expect(response.body).toHaveProperty('message', 'Registration successful. Please check your email to verify your account.');
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    
    // Verify user object structure
    expect(response.body.user).toHaveProperty('id');
    expect(response.body.user).toHaveProperty('username', validUserData.username);
    expect(response.body.user).toHaveProperty('email', validUserData.email);
    expect(response.body.user).toHaveProperty('firstName', validUserData.firstName);
    expect(response.body.user).toHaveProperty('lastName', validUserData.lastName);
    expect(response.body.user).toHaveProperty('role', 'user');
    expect(response.body.user).toHaveProperty('isEmailVerified', false);
    expect(response.body.user).not.toHaveProperty('password');

    // Optional: Verify JWT token structure
    const tokenPayload = JSON.parse(Buffer.from(response.body.token.split('.')[1], 'base64').toString());
    expect(tokenPayload).toHaveProperty('user');
    expect(tokenPayload.user).toHaveProperty('id');
    expect(tokenPayload.user).toHaveProperty('role', 'user');

    // Optional: Verify in database
    // const userInDb = await User.findOne({ email: validUserData.email });
    // expect(userInDb).not.toBeNull();
    // expect(userInDb?.username).toBe(validUserData.username);
    // expect(userInDb?.isEmailVerified).toBe(false);
  });

  it('should fail to register if email is missing', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(invalidUserDataMissingEmail);

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('errors');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'email',
          msg: expect.stringMatching(/email/i)
        })
      ])
    );
  });

  it('should fail to register if password is missing', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(invalidUserDataMissingPassword);

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('errors');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'password',
          msg: expect.stringMatching(/password/i)
        })
      ])
    );
  });

  it('should fail to register if username is missing', async () => {
    const invalidData = {
      email: `test_no_username_${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'Test',
      lastName: 'User'
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(invalidData);

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('errors');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'username',
          msg: expect.stringMatching(/username/i)
        })
      ])
    );
  });

  it('should fail to register if email is already in use', async () => {
    const userData1 = {
      username: `user1_${Date.now()}`,
      email: `duplicate_${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'User',
      lastName: 'One'
    };

    const userData2 = {
      username: `user2_${Date.now()}`,
      email: userData1.email, // Same email
      password: 'Password2!',
      firstName: 'User',
      lastName: 'Two'
    };

    // Register first user
    await request(app)
      .post('/api/auth/register')
      .send(userData1);

    // Attempt to register second user with same email
    const response = await request(app)
      .post('/api/auth/register')
      .send(userData2);

    expect(response.statusCode).toBe(400); // Your API returns 400, not 409
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toMatch(/already exists|duplicate/i);
  });

  it('should fail to register if username is already taken', async () => {
    const username = `taken_${Date.now()}`;
    
    const userData1 = {
      username,
      email: `user1_${Date.now()}@example.com`,
      password: 'Password1!',
      firstName: 'User',
      lastName: 'One'
    };

    const userData2 = {
      username, // Same username
      email: `user2_${Date.now()}@example.com`,
      password: 'Password2!',
      firstName: 'User',
      lastName: 'Two'
    };

    // Register first user
    await request(app)
      .post('/api/auth/register')
      .send(userData1);

    // Attempt to register second user with same username
    const response = await request(app)
      .post('/api/auth/register')
      .send(userData2);

    expect(response.statusCode).toBe(400); // Your API returns 400, not 409
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toMatch(/already exists|duplicate/i);
  });

  it('should fail to register with invalid email format', async () => {
    const invalidEmailData = {
      username: `user_${Date.now()}`,
      email: 'invalid-email-format',
      password: 'Password1!',
      firstName: 'Test',
      lastName: 'User'
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(invalidEmailData);

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('errors');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'email',
          msg: expect.stringMatching(/valid email/i)
        })
      ])
    );
  });

  it('should fail to register with weak password', async () => {
    const weakPasswordData = {
      username: `user_${Date.now()}`,
      email: `weak_password_${Date.now()}@example.com`,
      password: '123', // Weak password
      firstName: 'Test',
      lastName: 'User'
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(weakPasswordData);

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('errors');
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'password',
          msg: expect.stringMatching(/password/i)
        })
      ])
    );
  });
});