// src/__tests__/post.test.ts
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import { NotificationService } from '../services/notification.service';
import Post from '../models/Post';

// --- Mock external services ---
jest.mock('../services/notification.service');
// jest.mock('../middlewares/s3-upload.middleware', () => {
//   const dummyMiddleware = (req: any, res: any, next: () => void) => next();
//   return {
//     __esModule: true, // This helps with ES module interoperability
//     default: dummyMiddleware,
//     profilePicture: dummyMiddleware,
//     // Add any other named exports from the middleware here if they exist
//     // e.g., coverPhoto: dummyMiddleware,
//     deleteFile: jest.fn(), // Mock deleteFile as a simple function
//   };
// });

describe('Post API Endpoints', () => {

  // --- Suite for POST /api/posts ---
  describe('POST /api/posts - Create Post', () => {
    let token: string;
    let userId: string;

    beforeEach(async () => {
      const user = {
        username: `post_creator_${Date.now()}`, email: `post_creator_${Date.now()}@test.com`,
        password: 'Password123!', firstName: 'Post', lastName: 'Creator',
      };
      await request(app).post('/api/auth/register').send(user);
      const loginRes = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
      token = loginRes.body.token;
      userId = loginRes.body.user.id;
    });

    it('should return 201 and create a new post with valid text', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'A test post' });

      expect(response.statusCode).toBe(201);
      expect(response.body.post.text).toBe('A test post');
      expect(response.body.post.user._id).toBe(userId);
    });
  });
  
  // --- Suite for DELETE /api/posts/:id ---
  describe('DELETE /api/posts/:id - Delete Post', () => {
    let userAToken: string, userBToken: string, postToDeleteId: string;
    
    beforeEach(async () => {
      const userA = {
          username: `user_a_${Date.now()}`, email: `usera_${Date.now()}@test.com`,
          password: 'PasswordA123!', firstName: 'User', lastName: 'A',
      };
      await request(app).post('/api/auth/register').send(userA);
      const loginA = await request(app).post('/api/auth/login').send({ email: userA.email, password: userA.password });
      userAToken = loginA.body.token;

      const userB = {
          username: `user_b_${Date.now()}`, email: `userb_${Date.now()}@test.com`,
          password: 'PasswordB123!', firstName: 'User', lastName: 'B',
      };
      await request(app).post('/api/auth/register').send(userB);
      const loginB = await request(app).post('/api/auth/login').send({ email: userB.email, password: userB.password });
      userBToken = loginB.body.token;

      const postRes = await request(app).post('/api/posts').set('Authorization', `Bearer ${userAToken}`).send({ text: 'This will be deleted' });
      postToDeleteId = postRes.body.post._id;
    });

    it('should return 200 if the user is the author', async () => {
      const response = await request(app).delete(`/api/posts/${postToDeleteId}`).set('Authorization', `Bearer ${userAToken}`);
      expect(response.statusCode).toBe(200);
    });

    it('should return 403 if a user tries to delete another user\'s post', async () => {
      const response = await request(app).delete(`/api/posts/${postToDeleteId}`).set('Authorization', `Bearer ${userBToken}`);
      expect(response.statusCode).toBe(403);
    });
  });

  // --- Suite for PUT /api/posts/:id ---
  describe('PUT /api/posts/:id - Update Post', () => {
      let userAToken: string, userBToken: string, postToUpdateId: string;

      beforeEach(async () => {
          const userA = { username: `user_a_upd_${Date.now()}`, email: `usera_upd_${Date.now()}@test.com`, password: 'PasswordA123!', firstName: 'User', lastName: 'A' };
          await request(app).post('/api/auth/register').send(userA);
          const loginA = await request(app).post('/api/auth/login').send({ email: userA.email, password: userA.password });
          userAToken = loginA.body.token;

          const userB = { username: `user_b_upd_${Date.now()}`, email: `userb_upd_${Date.now()}@test.com`, password: 'PasswordB123!', firstName: 'User', lastName: 'B' };
          await request(app).post('/api/auth/register').send(userB);
          const loginB = await request(app).post('/api/auth/login').send({ email: userB.email, password: userB.password });
          userBToken = loginB.body.token;

          const postRes = await request(app).post('/api/posts').set('Authorization', `Bearer ${userAToken}`).send({ text: 'Original text' });
          postToUpdateId = postRes.body.post._id;
      });

      it('should return 200 and update the post if the user is the author', async () => {
          const response = await request(app).put(`/api/posts/${postToUpdateId}`).set('Authorization', `Bearer ${userAToken}`).send({ text: 'Updated text!' });
          expect(response.statusCode).toBe(200);
          expect(response.body.text).toBe('Updated text!');
      });

      it('should return 403 if a user tries to update another user\'s post', async () => {
          const response = await request(app).put(`/api/posts/${postToUpdateId}`).set('Authorization', `Bearer ${userBToken}`).send({ text: 'Should fail' });
          expect(response.statusCode).toBe(403);
      });
  });

});
