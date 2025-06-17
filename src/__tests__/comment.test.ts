// FILE: src/__tests__/comment.test.ts
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';

// Mock the notification service, just like in your working post.test.ts
jest.mock('../services/notification.service');

describe('Comment API Endpoints', () => {
  describe('POST /api/comments', () => {
    // These variables are reset for each test, following the working pattern.
    let token: string;
    let userId: string;
    let postId: string;
    let userPayload: any;

    // Use beforeEach, exactly like your working post.test.ts
    beforeEach(async () => {
      // 1. Create a user
      userPayload = {
        username: `comment_user_${Date.now()}`,
        email: `commenter_${Date.now()}@test.com`,
        password: 'Password123!',
        firstName: 'Comment',
        lastName: 'User',
      };

      const registerRes = await request(app).post('/api/auth/register').send(userPayload);
      
      // Debug: Check if registration was successful
      console.log('Registration response status:', registerRes.statusCode);
      if (registerRes.statusCode !== 201) {
        console.log('Registration failed with body:', registerRes.body);
      }
      
      // Ensure registration was successful
      expect(registerRes.statusCode).toBe(201);

      // 2. Log in with that user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: userPayload.email, password: userPayload.password });

      // Debug: Check login response structure
      console.log('Login response status:', loginRes.statusCode);
      if (loginRes.statusCode !== 200) {
        console.log('Login failed with body:', loginRes.body);
      } else {
        console.log('Login successful, user structure:', JSON.stringify(loginRes.body.user, null, 2));
      }

      // Check if login was successful before proceeding
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.user).toBeDefined();

      token = loginRes.body.token;
      
      // Try different possible user ID fields based on your API structure
      userId = loginRes.body.user.id || loginRes.body.user._id;
      
      console.log('Extracted userId:', userId);
      console.log('Extracted token:', token ? 'Token exists' : 'No token');

      // 3. Create a post to comment on
      const postRes = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'A post for our comment test' });

      console.log('Post creation response status:', postRes.statusCode);
      console.log('Post creation response body:', postRes.body);

      expect(postRes.statusCode).toBe(201);
      postId = postRes.body.post._id || postRes.body._id;
      console.log('Extracted postId:', postId);
    });

    it('should return 201 and the new comment for an authenticated user', async () => {
      const commentText = 'This is a fantastic post!';
      
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ postId, text: commentText });

      console.log('Comment creation response status:', response.statusCode);
      console.log('Comment creation response body:', response.body);

      // Assertions
      expect(response.statusCode).toBe(201);
      expect(response.body.text).toBe(commentText);
      expect(response.body.post).toBe(postId);
      // The user object in the response should have ._id, which we compare to our saved .id
      expect(response.body.user._id || response.body.user.id).toBe(userId); 
    });

    it('should return 401 if no token is provided', async () => {
      const response = await request(app)
        .post('/api/comments')
        .send({ postId, text: 'This should fail.' });

      expect(response.statusCode).toBe(401);
    });
    
    it('should return 404 if the postId does not exist', async () => {
      const fakePostId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ postId: fakePostId, text: 'A comment on a ghost post.' });

      expect(response.statusCode).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 400 if the comment text is missing', async () => {
      const response = await request(app)
        .post('/api/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ postId });

      expect(response.statusCode).toBe(400);
    });
  });
});