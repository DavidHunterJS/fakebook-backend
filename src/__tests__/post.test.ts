// src/__tests__/post.test.ts
import request from 'supertest';
import { app } from '../app'; // Adjust path if needed
import { NotificationService } from '../services/notification.service';
import User from '../models/User';

// --- Mock external services ---

// Mock the NotificationService to prevent real notifications
jest.mock('../services/notification.service', () => ({
  NotificationService: {
    mention: jest.fn().mockResolvedValue(undefined),
  },
}));

// ** THE DEFINITIVE S3 MIDDLEWARE MOCK **
// This version correctly simulates the behavior of multer for multipart forms.
jest.mock('../middlewares/s3-upload.middleware', () => ({
  __esModule: true,
  default: {
    // This is the fake middleware for post media.
    postMedia: (req: any, res: any, next: () => void) => {
      // The real multer middleware populates both req.body and req.files.
      // Our mock must do the same. We will simulate this by assuming
      // any fields sent via .field() are now in req.body.
      // Supertest doesn't expose the fields directly, so we have to
      // manually construct the body for the media upload tests.
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // If a text field was sent, it would be here.
        // For our test cases, we simulate this.
        req.body = req.body || {};
        if (req.headers['x-test-text']) { // We use a custom header to pass the text
          req.body.text = req.headers['x-test-text'];
        }
        
        // Simulate a file being uploaded
        req.files = [{
          originalname: 'test-image.jpg',
          mimetype: 'image/jpeg',
          key: 'posts/mock-test-image.jpg',
          location: 'https://fake-bucket.s3.amazonaws.com/posts/mock-test-image.jpg',
        }];
      }
      next(); // Pass control to the controller
    },
    // Add dummy functions for other upload types so that app loading doesn't crash
    profilePicture: (req: any, res: any, next: () => void) => next(),
    coverPhoto: (req: any, res: any, next: () => void) => next(),
  },
}));


describe('POST /api/posts - Create Post', () => {
  let token: string;
  let userId: string;

  const testUser = {
    username: `post_creator_${Date.now()}`,
    email: `post_creator_${Date.now()}@example.com`,
    password: 'Password123!',
    firstName: 'Post',
    lastName: 'Creator',
  };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(testUser);
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    token = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });

  describe('With Text Content', () => {
    it('should return 201 and create a new post with valid text', async () => {
      const postData = { text: 'This is a text-only test post!' };
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send(postData);

      expect(response.statusCode).toBe(201);
      expect(response.body.post.text).toBe(postData.text);
      expect(response.body.post.user._id).toBe(userId);
    });

    it('should return 401 Unauthorized if the user is not logged in', async () => {
      const response = await request(app)
        .post('/api/posts')
        .send({ text: 'This should fail.' });
      expect(response.statusCode).toBe(401);
    });

    it('should return 400 if the post has no text or media', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: ' ' });

      expect(response.statusCode).toBe(400);
    });
    
    it('should trigger a notification on user mention', async () => {
        const mentionedUser = await new User({ 
            username: 'mentioned', 
            email: 'mentioned@test.com', 
            password: 'password',
            firstName: 'Mention',
            lastName: 'User'
        }).save();
        const postWithMention = { text: `Hello @${mentionedUser.username}` };

        await request(app)
            .post('/api/posts')
            .set('Authorization', `Bearer ${token}`)
            .send(postWithMention);

        expect(NotificationService.mention).toHaveBeenCalledTimes(1);
    });
  });

  describe('With Media Content', () => {
    it('should return 201 and create a new post with an image attachment', async () => {
      const postText = 'This post has an image!';
      
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        // ** CORRECTED: Pass the text via a header so our mock can see it **
        .set('X-Test-Text', postText)
        .attach('media', Buffer.from('fake image data'), 'test-image.jpg');

      expect(response.statusCode).toBe(201);
      expect(response.body.message).toBe('Post created successfully');
      
      const post = response.body.post;
      // This will now pass because the mock correctly sets the text on req.body
      expect(post.text).toBe(postText);
      
      expect(post.media).toHaveLength(1);
      expect(post.media[0]).toHaveProperty('url');
    });

    it('should create a post with only media and no text', async () => {
        const response = await request(app)
            .post('/api/posts')
            .set('Authorization', `Bearer ${token}`)
            // We don't send the X-Test-Text header, so text will be undefined,
            // and the controller will apply the default "Post with media" text.
            .attach('media', Buffer.from('another fake image'), 'another.png');

        expect(response.statusCode).toBe(201);
        expect(response.body.post.media).toHaveLength(1);
        expect(response.body.post.text).toBe('Post with media');
    });
  });
});
