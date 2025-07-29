import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import User from '../models/User';
import Post from '../models/Post';
import Notification from '../models/Notification';

describe('Notification API Endpoints', () => {
  // --- Test Suite Setup ---
  let tokenA: string, tokenB: string;
  let userAId: string, userBId: string;
  let postAId: string;

  // Set up the users and a post once before all tests in this file run.
  beforeAll(async () => {
    // Clean up any existing test data first
    await User.deleteMany({ 
      email: { $regex: /_notif_.*@test\.com$/ } 
    });
    await Post.deleteMany({});
    await Notification.deleteMany({});

    // Create User A (the recipient of notifications)
    const userAPayload = {
      username: `userA_notif_${Date.now()}`,
      email: `userA_notif_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'User',
      lastName: 'A',
    };
    
    const registerResA = await request(app).post('/api/auth/register').send(userAPayload);
    expect(registerResA.statusCode).toBe(201); // Ensure registration succeeds
    
    // Make sure to set isEmailVerified to true
    await User.updateOne({ email: userAPayload.email }, { $set: { isEmailVerified: true } });
    
    const loginARes = await request(app).post('/api/auth/login').send({ 
      email: userAPayload.email, 
      password: userAPayload.password 
    });
    expect(loginARes.statusCode).toBe(200); // Ensure login succeeds
    tokenA = loginARes.body.token;
    userAId = loginARes.body.user.id;

    // Create User B (the sender of notifications)
    const userBPayload = {
      username: `userB_notif_${Date.now()}`,
      email: `userB_notif_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'User',
      lastName: 'B',
    };
    
    const registerResB = await request(app).post('/api/auth/register').send(userBPayload);
    expect(registerResB.statusCode).toBe(201); // Ensure registration succeeds
    
    await User.updateOne({ email: userBPayload.email }, { $set: { isEmailVerified: true } });
    
    const loginBRes = await request(app).post('/api/auth/login').send({ 
      email: userBPayload.email, 
      password: userBPayload.password 
    });
    expect(loginBRes.statusCode).toBe(200); // Ensure login succeeds
    tokenB = loginBRes.body.token;
    userBId = loginBRes.body.user.id;

    // Create a post with User A, so User B can interact with it
    const postRes = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ text: 'A post for notification testing' });
    expect(postRes.statusCode).toBe(201); // Ensure post creation succeeds
    postAId = postRes.body.post._id;

    // Verify users exist in database after setup
    const userAExists = await User.findById(userAId);
    const userBExists = await User.findById(userBId);
    expect(userAExists).toBeTruthy();
    expect(userBExists).toBeTruthy();
    
    console.log(`Setup complete - UserA: ${userAId}, UserB: ${userBId}, Post: ${postAId}`);
  });
  
  // Clean up notifications after each test to ensure isolation
  afterEach(async () => {
    await Notification.deleteMany({});
  });

  // Clean up everything after all tests
  afterAll(async () => {
    await User.deleteMany({ 
      email: { $regex: /_notif_.*@test\.com$/ } 
    });
    await Post.deleteMany({});
    await Notification.deleteMany({});
  });

  // --- Test Cases ---
  
  describe('GET /api/notifications', () => {
    it('should return an empty array if the user has no notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenA}`);
        
      expect(response.statusCode).toBe(200);
      expect(response.body.notifications).toEqual([]);
      expect(response.body.unreadCount).toBe(0);
    });

    it('should return notifications intended for the authenticated user', async () => {
      // Action: User B likes User A's post using the new /reactions endpoint.
      const likeResponse = await request(app)
        .post(`/api/posts/${postAId}/reactions`)
        .set('Authorization', `Bearer ${tokenB}`) // --- FIX IS HERE ---
        .send({ type: 'like' });
      
      // Check if reaction was successful
      expect([200, 201]).toContain(likeResponse.statusCode);

      // Test: Fetch notifications for User A
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenA}`);
      
      expect(response.statusCode).toBe(200);
      expect(response.body.notifications).toHaveLength(1);
      expect(response.body.unreadCount).toBe(1);
      
      const notification = response.body.notifications[0];
      expect(notification.recipient).toBe(userAId);
      expect(notification.sender._id).toBe(userBId);
      expect(notification.type).toBe('post_like');
      expect(notification.read).toBe(false);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return the correct count of unread notifications', async () => {
      // Create notifications manually for a predictable test
      await Notification.create([
        { recipient: userAId, sender: userBId, type: 'post_like', read: false },
        { recipient: userAId, sender: userBId, type: 'friend_request', read: false },
        { recipient: userAId, sender: userBId, type: 'post_comment', read: true }, // one is read
      ]);

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.count).toBe(2);
    });
  });
  
  describe('PUT /api/notifications/:id/read', () => {
    it('should mark a specific notification as read', async () => {
      const notif = await Notification.create({ 
        recipient: userAId, 
        sender: userBId, 
        type: 'post_like',
      });
      
      const response = await request(app)
        .put(`/api/notifications/${notif._id}/read`)
        .set('Authorization', `Bearer ${tokenA}`);
      
      expect(response.statusCode).toBe(200);
      
      const updatedNotif = await Notification.findById(notif._id);
      expect(updatedNotif?.read).toBe(true);
    });
    
    it('should return 404 if a user tries to mark another user\'s notification as read', async () => {
      const notifForUserB = await Notification.create({ 
        recipient: userBId, 
        sender: userAId,
        type: 'post_like',
      });
      
      // User A tries to mark User B's notification as read
      const response = await request(app)
        .put(`/api/notifications/${notifForUserB._id}/read`)
        .set('Authorization', `Bearer ${tokenA}`);
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('PUT /api/notifications/read-all', () => {
    it('should mark all unread notifications as read for the user', async () => {
      await Notification.create([
        { recipient: userAId, sender: userBId, type: 'post_like' },
        { recipient: userAId, sender: userBId, type: 'post_comment' },
        { recipient: userBId, sender: userAId, type: 'friend_request' }, // This one should not be affected
      ]);
      
      let unreadCount = await Notification.countDocuments({ recipient: userAId, read: false });
      expect(unreadCount).toBe(2);
      
      const response = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${tokenA}`);
      
      expect(response.statusCode).toBe(200);
      
      unreadCount = await Notification.countDocuments({ recipient: userAId, read: false });
      expect(unreadCount).toBe(0);

      const unaffectedNotifCount = await Notification.countDocuments({ recipient: userBId, read: false });
      expect(unaffectedNotifCount).toBe(1);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete a user\'s own notification', async () => {
      const notif = await Notification.create({ 
        recipient: userAId, 
        sender: userBId,
        type: 'post_like',
      });

      const response = await request(app)
        .delete(`/api/notifications/${notif._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.statusCode).toBe(200);

      const deletedNotif = await Notification.findById(notif._id);
      expect(deletedNotif).toBeNull();
    });

    it('should return 404 when trying to delete another user\'s notification', async () => {
      const notifForUserB = await Notification.create({ 
        recipient: userBId, 
        sender: userAId,
        type: 'post_like',
      });

      const response = await request(app)
        .delete(`/api/notifications/${notifForUserB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.statusCode).toBe(404);
    });
  });
});
