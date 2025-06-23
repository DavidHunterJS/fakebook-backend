// src/__tests__/friend.controller.test.ts
import request from 'supertest';
import { app } from '../app'; // Import the Express app for Supertest
import mongoose from 'mongoose';
import User from '../models/User';
import Friend, { FriendshipStatus } from '../models/Friend';
import { NotificationService } from '../services/notification.service';

// --- IMPORTANT: Mocks specific to THIS test file ---
// Since `src/__tests__/setup.ts` is not modified, we need to mock these here.

// Import the authMiddleware from its path. Jest will ensure this imports the mocked version.
import authMiddleware from '../middlewares/auth.middleware';

// Mock the authentication middleware. This is crucial because your routes are protected.
// This mock allows us to control `req.user.id` directly for each test scenario.
// Key Change: We now directly return the jest.fn() instance from the mock factory.
jest.mock('../middlewares/auth.middleware', () => jest.fn((req, res, next) => {
  // Default mock implementation, will be overridden in beforeEach
  req.user = { id: new mongoose.Types.ObjectId().toHexString() };
  next();
}));

// Mock the NotificationService to prevent actual network calls during tests.
// This ensures your tests are isolated and don't send real notifications.
jest.mock('../services/notification.service', () => ({
  NotificationService: {
    friendRequest: jest.fn(),
    friendAccept: jest.fn(),
    // Add other methods (like friendDecline, friendCancel, etc.) if your tests will trigger them
  },
}));

// Mock the upload.middleware if it's imported in the controller.
// Although it's imported in friend.controller.ts, it's not directly used in the friend
// request/acceptance logic, but mocking it prevents potential issues.
jest.mock('../middlewares/upload.middleware', () => ({
  default: jest.fn((req, res, next) => {
    next(); // Just call next, as it's not directly impacting friend logic in these tests.
  }),
}));

// --- End of Mocks specific to THIS test file ---


// Describe block for Friend Controller tests
describe('Friend Controller', () => {
  // Declare user IDs that will be used across tests
  let requesterId: string;
  let recipientId: string;
  let anotherUserId: string; // Useful for future tests

  // beforeEach hook: Runs before each test in this describe block.
  // This is critical for test isolation as it clears the database and
  // sets up fresh test data and mocks for every test.
  beforeEach(async () => {
    // --- Database Clearing for Test Isolation ---
    // Since `setup.ts` doesn't clear collections before each test, we do it here.
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
    // --- End Database Clearing ---

    // Clear all mock calls and reset their implementations for a fresh state in each test.
    // This will reset `authMiddleware` and `NotificationService` mocks.
    jest.clearAllMocks();

    // Create User 1 (will act as the requester/current user in most tests)
    const requester = new User({
      _id: new mongoose.Types.ObjectId(), // Generate a unique ObjectId
      firstName: 'Test',
      lastName: 'Requester',
      name: 'Test Requester',
      username: 'testrequester',
      email: 'requester@example.com',
      password: 'password123',
      lastActive: new Date(),
    });
    await requester.save();
    requesterId = requester._id.toHexString();

    // Create User 2 (will act as the recipient of requests)
    const recipient = new User({
      _id: new mongoose.Types.ObjectId(), // Generate a unique ObjectId
      firstName: 'Test',
      lastName: 'Recipient',
      name: 'Test Recipient',
      username: 'testrecipient',
      email: 'recipient@example.com',
      password: 'password123',
      lastActive: new Date(),
    });
    await recipient.save();
    recipientId = recipient._id.toHexString();

    // Create a third user (useful for future tests involving more complex scenarios)
    const anotherUser = new User({
      _id: new mongoose.Types.ObjectId(),
      firstName: 'Another',
      lastName: 'User',
      name: 'Another User',
      username: 'anotheruser',
      email: 'another@example.com',
      password: 'password123',
      lastActive: new Date(),
    });
    await anotherUser.save();
    anotherUserId = anotherUser._id.toHexString();

    // Re-mock the auth middleware for each test to set the `req.user.id`.
    // By default, we set it to `requesterId`. Individual tests can override this.
    // Now we use the directly imported `authMiddleware` (which is the jest.fn() instance).
    (authMiddleware as jest.Mock).mockImplementation((req, res, next) => {
      req.user = { id: requesterId };
      next();
    });
  });

  // Test Case 1: Successfully sending a friend request
  it('should send a friend request successfully and return 201', async () => {
    // Send a POST request from `requesterId` to `recipientId`
    const res = await request(app)
      .post(`/api/friends/request/${recipientId}`)
      .set('Authorization', 'Bearer dummy_token'); // A dummy token suffices due to the mocked auth middleware

    // Assertions on the HTTP response
    expect(res.statusCode).toEqual(201);
    expect(res.body.message).toEqual('Friend request sent');
    expect(res.body.friendship).toBeDefined();
    expect(res.body.friendship.requester).toEqual(requesterId);
    expect(res.body.friendship.recipient).toEqual(recipientId);
    expect(res.body.friendship.status).toEqual(FriendshipStatus.PENDING);

    // Verify that the friendship document was correctly saved in the database
    const friendshipInDb = await Friend.findOne({
      requester: requesterId,
      recipient: recipientId,
    });
    expect(friendshipInDb).toBeDefined();
    expect(friendshipInDb?.status).toEqual(FriendshipStatus.PENDING);

    // Verify that the NotificationService.friendRequest mock was called correctly
    expect(NotificationService.friendRequest).toHaveBeenCalledTimes(1);
    expect(NotificationService.friendRequest).toHaveBeenCalledWith(requesterId, recipientId);
  });

  // Test Case 2: Successfully accepting a pending friend request
  it('should accept a pending friend request successfully and return 200', async () => {
    // Arrange: First, create a pending friend request where `recipientId` sent it to `requesterId`.
    // This sets up the scenario where `requesterId` (the current acting user in the test) will accept.
    const pendingFriendship = new Friend({
      requester: recipientId, // `recipientId` is the one who sent the original request
      recipient: requesterId, // `requesterId` is the one who received it and will now accept
      status: FriendshipStatus.PENDING,
    });
    await pendingFriendship.save();

    // Act: Temporarily re-mock the auth middleware to simulate `requesterId` (the recipient of the request) acting.
    // `mockImplementationOnce` ensures this mock only applies to this single `request` call.
    (authMiddleware as jest.Mock).mockImplementationOnce((req, res, next) => {
      req.user = { id: requesterId }; // Now `req.user.id` is the ID of the user accepting the request
      next();
    });

    // Send a PUT request to the accept friend request endpoint.
    // The `:userId` in the route should be the ID of the *original requester* (`recipientId` in this case).
    const res = await request(app)
      .put(`/api/friends/accept/${recipientId}`)
      .set('Authorization', 'Bearer dummy_token');

    // Assertions on the HTTP response
    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Friend request accepted');
    expect(res.body.friendship).toBeDefined();
    expect(res.body.friendship.status).toEqual(FriendshipStatus.ACCEPTED);

    // Verify that the friendship status was updated in the database
    const updatedFriendship = await Friend.findById(pendingFriendship._id);
    expect(updatedFriendship).toBeDefined();
    expect(updatedFriendship?.status).toEqual(FriendshipStatus.ACCEPTED);

    // Verify that NotificationService.friendAccept mock was called correctly
    expect(NotificationService.friendAccept).toHaveBeenCalledTimes(1);
    expect(NotificationService.friendAccept).toHaveBeenCalledWith(requesterId, recipientId);
  });

  // You can add more tests here for various scenarios, e.g.:
  // - Sending a request to a non-existent user
  // - Sending a request to yourself
  // - Sending a request when already friends
  // - Sending a request when a pending request already exists (from same or other user)
  // - Sending a request when blocked
  // - Accepting a non-existent request
  // - Accepting an already accepted/declined/blocked request
  // - Etc.
});
