// src/__tests__/post.test.ts
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app'; // Adjust path if needed
import { NotificationService } from '../services/notification.service';
import User from '../models/User';
import Post from '../models/Post';

// --- Mock external services ---
jest.mock('../services/notification.service', () => ({
  NotificationService: {
    mention: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock the s3UploadMiddleware to prevent real S3 interactions
jest.mock('../middlewares/s3-upload.middleware', () => ({
  __esModule: true,
  default: {
    postMedia: (req: any, res: any, next: () => void) => {
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        req.files = [{
          originalname: 'test-image.jpg', mimetype: 'image/jpeg',
          key: 'posts/mock-test-image.jpg',
          location: 'https://fake-bucket.s3.amazonaws.com/posts/mock-test-image.jpg',
        }];
      }
      next();
    },
    // Add a mock for the deleteFile function
    deleteFile: jest.fn().mockResolvedValue(true),
    profilePicture: (req: any, res: any, next: () => void) => next(),
    coverPhoto: (req: any, res: any, next: () => void) => next(),
  },
}));

// --- Test Suites ---

describe('POST /api/posts - Create Post', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const testUser = {
      username: `post_creator_${Date.now()}`, email: `post_creator_${Date.now()}@example.com`,
      password: 'Password123!', firstName: 'Post', lastName: 'Creator',
    };
    await request(app).post('/api/auth/register').send(testUser);
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: testUser.email, password: testUser.password,
    });
    token = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });
  
  it('should return 201 and create a new post with valid text', async () => {
    const response = await request(app).post('/api/posts').set('Authorization', `Bearer ${token}`).send({ text: 'A test post' });
    expect(response.statusCode).toBe(201);
    expect(response.body.post.text).toBe('A test post');
  });
});

describe('DELETE /api/posts/:id - Delete Post', () => {
  let userAToken: string;
  let userBToken: string;
  let postToDeleteId: string;

  beforeEach(async () => {
    const userA = {
        username: `user_a_${Date.now()}`, email: `usera_${Date.now()}@test.com`,
        password: 'PasswordA123!', firstName: 'User', lastName: 'A',
    };
    await request(app).post('/api/auth/register').send(userA);
    const loginAResponse = await request(app).post('/api/auth/login').send({ email: userA.email, password: userA.password });
    userAToken = loginAResponse.body.token;

    const userB = {
        username: `user_b_${Date.now()}`, email: `userb_${Date.now()}@test.com`,
        password: 'PasswordB123!', firstName: 'User', lastName: 'B',
    };
    await request(app).post('/api/auth/register').send(userB);
    const loginBResponse = await request(app).post('/api/auth/login').send({ email: userB.email, password: userB.password });
    userBToken = loginBResponse.body.token;

    const postResponse = await request(app).post('/api/posts').set('Authorization', `Bearer ${userAToken}`).send({ text: 'This post will be deleted' });
    postToDeleteId = postResponse.body.post._id;
  });

  it('should return 200 and delete the post if the user is the author', async () => {
    const response = await request(app).delete(`/api/posts/${postToDeleteId}`).set('Authorization', `Bearer ${userAToken}`);
    expect(response.statusCode).toBe(200);
  });

  it('should return 403 Forbidden if a user tries to delete another user\'s post', async () => {
    const response = await request(app).delete(`/api/posts/${postToDeleteId}`).set('Authorization', `Bearer ${userBToken}`);
    expect(response.statusCode).toBe(403);
  });
});


// ** NEW TEST SUITE FOR UPDATING POSTS **
describe('PUT /api/posts/:id - Update Post', () => {
  let userAToken: string;
  let userBToken: string;
  let postToUpdateId: string;

  beforeEach(async () => {
    // Create User A
    const userA = {
        username: `user_a_update_${Date.now()}`, email: `usera_update_${Date.now()}@test.com`,
        password: 'PasswordA123!', firstName: 'User', lastName: 'A',
    };
    await request(app).post('/api/auth/register').send(userA);
    const loginAResponse = await request(app).post('/api/auth/login').send({ email: userA.email, password: userA.password });
    userAToken = loginAResponse.body.token;

    // Create User B
    const userB = {
        username: `user_b_update_${Date.now()}`, email: `userb_update_${Date.now()}@test.com`,
        password: 'PasswordB123!', firstName: 'User', lastName: 'B',
    };
    await request(app).post('/api/auth/register').send(userB);
    const loginBResponse = await request(app).post('/api/auth/login').send({ email: userB.email, password: userB.password });
    userBToken = loginBResponse.body.token;

    // Create a post by User A to be updated in the tests
    const postResponse = await request(app).post('/api/posts').set('Authorization', `Bearer ${userAToken}`).send({ text: 'Original post text' });
    postToUpdateId = postResponse.body.post._id;
  });

  it('should return 200 and update the post text and visibility if the user is the author', async () => {
    const updateData = {
      text: 'Updated post text!',
      visibility: 'friends',
    };

    const response = await request(app)
      .put(`/api/posts/${postToUpdateId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send(updateData);
    
    expect(response.statusCode).toBe(200);
    // Check if the returned post reflects the updates
    expect(response.body.text).toBe(updateData.text);
    expect(response.body.visibility).toBe(updateData.visibility);

    // Verify the changes in the database
    const updatedPostInDb = await Post.findById(postToUpdateId);
    expect(updatedPostInDb?.text).toBe(updateData.text);
    expect(updatedPostInDb?.visibility).toBe(updateData.visibility);
  });

  it('should return 403 Forbidden if a user tries to update another user\'s post', async () => {
    const updateData = { text: 'This update should fail' };

    const response = await request(app)
      .put(`/api/posts/${postToUpdateId}`)
      .set('Authorization', `Bearer ${userBToken}`) // Use User B's token
      .send(updateData);

    expect(response.statusCode).toBe(403);
    expect(response.body.message).toBe('Not authorized to edit this post');

    // Verify the post was NOT updated in the database
    const postInDb = await Post.findById(postToUpdateId);
    expect(postInDb?.text).toBe('Original post text');
  });

  it('should return 404 Not Found if trying to update a post that does not exist', async () => {
    const fakePostId = new mongoose.Types.ObjectId().toHexString();
    const updateData = { text: 'This update will fail' };

    const response = await request(app)
      .put(`/api/posts/${fakePostId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send(updateData);
      
    expect(response.statusCode).toBe(404);
    expect(response.body.message).toBe('Post not found');
  });
});
