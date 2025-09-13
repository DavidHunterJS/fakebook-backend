import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../app';
import User from '../models/User';
import Post from '../models/Post';
import Notification from '../models/Notification';
import Reaction from '../models/Reaction'; // Import the Reaction model

describe('Notification API Endpoints', () => {
  // --- Test Suite Setup ---
  let agentA: any, agentB: any;
  let userAId: string, userBId: string;
  let postAId: string;

  beforeAll(async () => {
    await User.deleteMany({ email: { $regex: /_notif_.*@test\.com$/ } });
    await Post.deleteMany({});
    await Notification.deleteMany({});
    await Reaction.deleteMany({}); // Also clean reactions before starting

    // Create agents for session management
    agentA = request.agent(app);
    agentB = request.agent(app);

    // Create User A (recipient)
    const userAPayload = {
      username: `userA_notif_${Date.now()}`,
      email: `userA_notif_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'User',
      lastName: 'A',
    };
    const registerResA = await agentA.post('/api/auth/register').send(userAPayload);
    await User.updateOne({ email: userAPayload.email }, { $set: { isEmailVerified: true } });
    const loginARes = await agentA.post('/api/auth/login').send({ email: userAPayload.email, password: userAPayload.password });
    userAId = loginARes.body.user.id;

    // Create User B (sender)
    const userBPayload = {
      username: `userB_notif_${Date.now()}`,
      email: `userB_notif_${Date.now()}@test.com`,
      password: 'Password123!',
      firstName: 'User',
      lastName: 'B',
    };
    const registerResB = await agentB.post('/api/auth/register').send(userBPayload);
    await User.updateOne({ email: userBPayload.email }, { $set: { isEmailVerified: true } });
    const loginBRes = await agentB.post('/api/auth/login').send({ email: userBPayload.email, password: userBPayload.password });
    userBId = loginBRes.body.user.id;

    // User A creates a post using session
    const postRes = await agentA
      .post('/api/posts')
      .send({ text: 'A post for notification testing' });
    postAId = postRes.body.post._id;
  });
  
  // Clean up collections after each test to ensure isolation
  afterEach(async () => {
    await Notification.deleteMany({});
    await Reaction.deleteMany({});
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: /_notif_.*@test\.com$/ } });
    await Post.deleteMany({});
    await Notification.deleteMany({});
    await Reaction.deleteMany({});
  });

  describe('GET /api/notifications', () => {
    it('should return an empty array if the user has no notifications', async () => {
      const response = await agentA.get('/api/notifications');
      expect(response.statusCode).toBe(200);
      expect(response.body.notifications).toEqual([]);
    });

    it('should return notifications intended for the authenticated user', async () => {
      // Action: User B reacts to User A's post using session
      const likeResponse = await agentB
        .post(`/api/posts/${postAId}/reactions`)
        .send({ type: 'love' });
      expect([200, 201]).toContain(likeResponse.statusCode);

      // Test: Fetch notifications for User A using session
      const response = await agentA.get('/api/notifications');
      
      expect(response.statusCode).toBe(200);
      expect(response.body.notifications).toHaveLength(1);
      expect(response.body.unreadCount).toBe(1);
      
      const notification = response.body.notifications[0];
      expect(notification.recipient).toBe(userAId);
      expect(notification.sender._id).toBe(userBId);
      expect(notification.type).toBe('post_like');
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('should return the correct count of unread notifications', async () => {
      // --- FIX: Added content and link fields to all manual creations ---
      await Notification.create([
        { recipient: userAId, sender: userBId, type: 'post_like', content: '...', link: '...' },
        { recipient: userAId, sender: userBId, type: 'friend_request', content: '...', link: '...' },
        { recipient: userAId, sender: userBId, type: 'post_comment', read: true, content: '...', link: '...' },
      ]);

      const response = await agentA.get('/api/notifications/unread-count');

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
        content: 'Someone liked your post', 
        link: `/posts/${postAId}`
      });
      
      const response = await agentA.put(`/api/notifications/${notif._id}/read`);
      
      expect(response.statusCode).toBe(200);
      const updatedNotif = await Notification.findById(notif._id);
      expect(updatedNotif?.read).toBe(true);
    });
    
    it('should return 404 if a user tries to mark another user\'s notification as read', async () => {
      const notifForUserB = await Notification.create({ 
        recipient: userBId, 
        sender: userAId,
        type: 'post_like',
        content: 'Someone liked your post',
        link: `/posts/${postAId}`
      });
      
      const response = await agentA.put(`/api/notifications/${notifForUserB._id}/read`);
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('PUT /api/notifications/read-all', () => {
    it('should mark all unread notifications as read for the user', async () => {
      await Notification.create([
        { recipient: userAId, sender: userBId, type: 'post_like', content: '...', link: '...' },
        { recipient: userAId, sender: userBId, type: 'post_comment', content: '...', link: '...' },
        { recipient: userBId, sender: userAId, type: 'friend_request', content: '...', link: '...' },
      ]);
      
      const response = await agentA.put('/api/notifications/read-all');
      
      expect(response.statusCode).toBe(200);
      const unreadCount = await Notification.countDocuments({ recipient: userAId, read: false });
      expect(unreadCount).toBe(0);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete a user\'s own notification', async () => {
      const notif = await Notification.create({ 
        recipient: userAId, 
        sender: userBId,
        type: 'post_like',
        content: 'Someone liked your post',
        link: `/posts/${postAId}`
      });

      const response = await agentA.delete(`/api/notifications/${notif._id}`);

      expect(response.statusCode).toBe(200);
      const deletedNotif = await Notification.findById(notif._id);
      expect(deletedNotif).toBeNull();
    });

    it('should return 404 when trying to delete another user\'s notification', async () => {
      const notifForUserB = await Notification.create({ 
        recipient: userBId, 
        sender: userAId,
        type: 'post_like',
        content: 'Someone liked your post',
        link: `/posts/${postAId}`
      });

      const response = await agentA.delete(`/api/notifications/${notifForUserB._id}`);

      expect(response.statusCode).toBe(404);
    });
  });
});