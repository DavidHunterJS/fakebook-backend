// src/__tests__/friend.controller.test.ts
import request from 'supertest';
import { app } from '../app'; // Import the Express app for Supertest
import mongoose from 'mongoose';
import User from '../models/User';
import Friend, { FriendshipStatus } from '../models/Friend';
import { NotificationService } from '../services/notification.service';

// --- Mocks specific to THIS test file ---
import authMiddleware from '../middlewares/auth.middleware';

// Mock the authentication middleware
jest.mock('../middlewares/auth.middleware', () => jest.fn((req, res, next) => {
  req.user = { id: new mongoose.Types.ObjectId().toHexString() };
  next();
}));

// Mock the NotificationService to prevent actual network calls during tests.
jest.mock('../services/notification.service', () => ({
  NotificationService: {
    friendRequest: jest.fn(),
    friendAccept: jest.fn(),
    // ADDED: Mock for the decline notification
    friendDecline: jest.fn(),
  },
}));

// Mock the upload.middleware
jest.mock('../middlewares/upload.middleware', () => ({
  default: jest.fn((req, res, next) => {
    next();
  }),
}));
// --- End of Mocks ---


describe('Friend Controller', () => {
  let requesterId: string;
  let recipientId: string;
  let anotherUserId: string;

  beforeEach(async () => {
    // --- Database Clearing for Test Isolation ---
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
    // --- End Database Clearing ---

    jest.clearAllMocks();

    // Create User 1 (requester)
    const requester = new User({
      _id: new mongoose.Types.ObjectId(),
      firstName: 'Test',
      lastName: 'Requester',
      username: 'testrequester',
      email: 'requester@example.com',
      password: 'password123',
    });
    await requester.save();
    requesterId = requester._id.toHexString();

    // Create User 2 (recipient)
    const recipient = new User({
      _id: new mongoose.Types.ObjectId(),
      firstName: 'Test',
      lastName: 'Recipient',
      username: 'testrecipient',
      email: 'recipient@example.com',
      password: 'password123',
    });
    await recipient.save();
    recipientId = recipient._id.toHexString();
    
    // Create a third user
    const anotherUser = new User({
        _id: new mongoose.Types.ObjectId(),
        firstName: 'Another',
        lastName: 'User',
        username: 'anotheruser',
        email: 'another@example.com',
        password: 'password123',
    });
    await anotherUser.save();
    anotherUserId = anotherUser._id.toHexString();


    // Re-mock the auth middleware to set the default user for each test
    (authMiddleware as jest.Mock).mockImplementation((req, res, next) => {
      req.user = { id: requesterId };
      next();
    });
  });

  // Test Case 1: Successfully sending a friend request
  it('should send a friend request successfully and return 201', async () => {
    const res = await request(app)
      .post(`/api/friends/request/${recipientId}`)
      .set('Authorization', 'Bearer dummy_token');

    expect(res.statusCode).toEqual(201);
    expect(res.body.message).toEqual('Friend request sent');
    expect(res.body.friendship.status).toEqual(FriendshipStatus.PENDING);

    const friendshipInDb = await Friend.findOne({ requester: requesterId, recipient: recipientId });
    expect(friendshipInDb).toBeDefined();
    expect(friendshipInDb?.status).toEqual(FriendshipStatus.PENDING);

    expect(NotificationService.friendRequest).toHaveBeenCalledTimes(1);
    expect(NotificationService.friendRequest).toHaveBeenCalledWith(requesterId, recipientId);
  });

  // Test Case 2: Successfully accepting a pending friend request
  it('should accept a pending friend request successfully and return 200', async () => {
    // Arrange: Create a pending request from another user TO the main test user
    const pendingFriendship = new Friend({
      requester: anotherUserId,
      recipient: requesterId,
      status: FriendshipStatus.PENDING,
    });
    await pendingFriendship.save();

    // Act: As the main test user (`requesterId`), accept the request from `anotherUserId`
    const res = await request(app)
      .put(`/api/friends/accept/${anotherUserId}`)
      .set('Authorization', 'Bearer dummy_token');

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Friend request accepted and users are now friends.');
    expect(res.body.friendship.status).toEqual(FriendshipStatus.ACCEPTED);

    const updatedFriendship = await Friend.findById(pendingFriendship._id);
    expect(updatedFriendship?.status).toEqual(FriendshipStatus.ACCEPTED);

    expect(NotificationService.friendAccept).toHaveBeenCalledTimes(1);
    expect(NotificationService.friendAccept).toHaveBeenCalledWith(requesterId, anotherUserId);
  });

  // --- NEW TEST CASES ---

  // Test Case 3: Successfully declining a pending friend request
  it('should decline a pending friend request successfully and return 200', async () => {
    // Arrange: Create a pending request from `anotherUserId` TO the main test user (`requesterId`)
    const pendingFriendship = new Friend({
      requester: anotherUserId,
      recipient: requesterId,
      status: FriendshipStatus.PENDING,
    });
    await pendingFriendship.save();

    // Act: As the main test user (`requesterId`), decline the request from `anotherUserId`
    // Assuming a decline endpoint exists at PUT /api/friends/decline/:userId
    const res = await request(app)
      .put(`/api/friends/decline/${anotherUserId}`)
      .set('Authorization', 'Bearer dummy_token');

    // Assert
    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Friend request declined');
    
    const declinedFriendship = await Friend.findById(pendingFriendship._id);
    expect(declinedFriendship).toBeDefined();
    expect(declinedFriendship?.status).toEqual(FriendshipStatus.DECLINED);

    // Verify the correct notification was sent
    expect((NotificationService as any).friendDecline).toHaveBeenCalledTimes(1);
    expect((NotificationService as any).friendDecline).toHaveBeenCalledWith(requesterId, anotherUserId);
    // Ensure other notifications were not sent
    expect(NotificationService.friendAccept).not.toHaveBeenCalled();
  });

  // Test Case 4: Fail to send a friend request to oneself
  it('should fail to send a friend request to oneself and return 400', async () => {
    // Act: Try to send a request where the recipient is the same as the requester
    const res = await request(app)
      .post(`/api/friends/request/${requesterId}`)
      .set('Authorization', 'Bearer dummy_token');
    
    // Assert
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toEqual('You cannot send a friend request to yourself');

    // Verify no friendship document was created
    const friendshipCount = await Friend.countDocuments();
    expect(friendshipCount).toEqual(0);

    // Verify no notification was sent
    expect(NotificationService.friendRequest).not.toHaveBeenCalled();
  });

  // Test Case 5: Fail to send a friend request if one already exists
  it('should fail to send a friend request if a pending request already exists', async () => {
    // Arrange: Create an existing pending request from `requesterId` to `recipientId`
    await new Friend({
      requester: requesterId,
      recipient: recipientId,
      status: FriendshipStatus.PENDING,
    }).save();

    // Act: Attempt to send the exact same friend request again
    const res = await request(app)
      .post(`/api/friends/request/${recipientId}`)
      .set('Authorization', 'Bearer dummy_token');

    // Assert
    expect(res.statusCode).toEqual(400); // Or 409 Conflict, depending on your API design
    expect(res.body.message).toEqual('Friend request already sent');

    // Verify that only one document exists in the database
    const friendshipCount = await Friend.countDocuments();
    expect(friendshipCount).toEqual(1);

    // Verify the notification service was not called a second time
    expect(NotificationService.friendRequest).not.toHaveBeenCalled();
  });
});