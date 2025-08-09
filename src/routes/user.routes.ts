// src/routes/user.routes.ts
import express, { Router } from 'express';
import { body, param, query } from 'express-validator';
// ** CORRECTED IMPORT STYLE **
// Import the entire controller as a single object.
import * as userController from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/role.middleware';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';
import User from '../models/User';

const router: Router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);



router.post('/by-ids', authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ message: 'userIds array is required' });
    }
    
    const users = await User.find({
      _id: { $in: userIds },
      isActive: true
    }).select('firstName lastName username profilePicture isOnline');
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users by IDs:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Search users by name/username
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const users = await User.find({
      $and: [
        {
          $or: [
            { firstName: { $regex: q, $options: 'i' } },
            { lastName: { $regex: q, $options: 'i' } },
            { username: { $regex: q, $options: 'i' } }
          ]
        },
        { isActive: true },
        { _id: { $ne: req.user.id } } // Exclude current user
      ]
    }).select('firstName lastName username profilePicture isOnline').limit(20);
    
    res.json({ users });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});


/**
 * @route   GET api/users
 * @desc    Search for users
 * @access  Private
 */
router.get(
  '/',
  [
    query('query')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Search query must not be empty'),
    
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  userController.searchUsers
);

/**
 * @route   GET api/users/suggestions
 * @desc    Get friend suggestions
 * @access  Private
 */
router.get('/suggestions', userController.getFriendSuggestions);

/**
 * @route   GET api/users/profile/:username
 * @desc    Get user profile by username
 * @access  Private
 */
router.get(
  '/profile/:username',
  [
    param('username')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Username is required')
  ],
  userController.getUserProfile
);


/**
 * @route   GET api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get(
  '/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.getUserById
);

/**
 * @route   GET api/users/:id/friends
 * @desc    Get a specific user's friends list by their ID
 * @access  Private
 */
router.get(
  '/:id/friends',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.getUserFriends // Note: We will create this controller function next
);

/**
 * @route   GET api/users/:id/albums
 * @desc    Get a specific user's photo albums by their ID
 * @access  Private
 */
router.get(
  '/:id/albums',
  [
    param('id').isMongoId().withMessage('Invalid user ID')
  ],
  userController.getUserAlbums
);

/**
 * @route   PUT api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  [
    body('firstName')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be between 1 and 50 characters'),
    
    body('lastName')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be between 1 and 50 characters'),
    
    body('bio')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Bio cannot exceed 500 characters'),
    
    body('location')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Location cannot exceed 100 characters'),
    
    body('birthday')
      .optional()
      .isISO8601()
      .withMessage('Birthday must be a valid date')
  ],
  userController.updateProfile
);

/**
 * @route   POST api/users/profile/picture
 * @desc    Upload profile picture
 * @access  Private
 */
router.post(
  '/profile/picture', 
  authMiddleware, 
  s3UploadMiddleware.profilePicture, 
  userController.uploadProfilePicture
);

/**
 * @route   POST api/users/profile/cover
 * @desc    Upload cover photo
 * @access  Private
 */
router.post(
  '/profile/cover',
  authMiddleware,
  s3UploadMiddleware.coverPhoto,
  userController.uploadCoverPhoto
);

/**
 * @route   GET api/users/friends
 * @desc    Get user's friends
 * @access  Private
 */
router.get('/friends', userController.getFriends);

/**
 * @route   GET api/users/friend-requests
 * @desc    Get user's friend requests
 * @access  Private
 */
router.get('/friend-requests', userController.getFriendRequests);

/**
 * @route   POST api/users/friend-request/:userId
 * @desc    Send friend request
 * @access  Private
 */
router.post(
  '/friend-request/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.sendFriendRequest
);

/**
 * @route   PUT api/users/friend-request/:userId/accept
 * @desc    Accept friend request
 * @access  Private
 */
router.put(
  '/friend-request/:userId/accept',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.acceptFriendRequest
);

/**
 * @route   PUT api/users/friend-request/:userId/reject
 * @desc    Reject friend request
 * @access  Private
 */
router.put(
  '/friend-request/:userId/reject',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.rejectFriendRequest
);

/**
 * @route   DELETE api/users/friend/:userId
 * @desc    Remove friend
 * @access  Private
 */
router.delete(
  '/friend/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.removeFriend
);

/**
 * @route   POST api/users/block/:userId
 * @desc    Block user
 * @access  Private
 */
router.post(
  '/block/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.blockUser
);

/**
 * @route   DELETE api/users/block/:userId
 * @desc    Unblock user
 * @access  Private
 */
router.delete(
  '/block/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  userController.unblockUser
);

/**
 * @route   GET api/users/blocked
 * @desc    Get blocked users
 * @access  Private
 */
router.get('/blocked', userController.getBlockedUsers);

/**
 * @route   GET api/users/online-friends
 * @desc    Get online friends
 * @access  Private
 */
router.get('/online-friends', userController.getOnlineFriends);

/**
 * @route   PUT api/users/privacy-settings
 * @desc    Update privacy settings
 * @access  Private
 */
router.put(
  '/privacy-settings',
  [
    body('profileVisibility')
      .optional()
      .isIn(['public', 'friends', 'private'])
      .withMessage('Profile visibility must be public, friends, or private'),
    
    body('friendsVisibility')
      .optional()
      .isIn(['public', 'friends', 'private'])
      .withMessage('Friends visibility must be public, friends, or private'),
    
    body('postsVisibility')
      .optional()
      .isIn(['public', 'friends', 'private'])
      .withMessage('Posts visibility must be public, friends, or private')
  ],
  userController.updatePrivacySettings
);

/**
 * @route   GET api/users/admin/inactive
 * @desc    Get inactive users (admin only)
 * @access  Private/Admin
 */
router.get(
  '/admin/inactive',
  isAdmin,
  [
    query('days')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Days must be a positive integer'),
    
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  userController.getInactiveUsers
);

/**
 * @route   POST api/users/:userId/report
 * @desc    Report user
 * @access  Private
 */
router.post(
  '/:userId/report',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID'),
    
    body('reason')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Report reason is required')
      .isLength({ max: 1000 })
      .withMessage('Report reason cannot exceed 1000 characters')
  ],
  userController.reportUser
);

/**
 * @route   GET api/users/admin/reported
 * @desc    Get reported users (admin only)
 * @access  Private/Admin
 */
router.get(
  '/admin/reported',
  isAdmin,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  userController.getReportedUsers
);

export default router;
