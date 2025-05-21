// src/routes/user.routes.ts
import express, { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  searchUsers,
  getUserById,
  getUserProfile,
  updateProfile,
  uploadProfilePicture, // <---s Import it directly by name
  uploadCoverPhoto,
  getFriends,
  getFriendRequests,
  getFriendSuggestions,
  // ... include all other controller functions you use from user.controller.ts
  sendFriendRequest, // (these might be in friend.controller.ts or user.controller.ts based on your full structure)
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getOnlineFriends,
  updatePrivacySettings,
  getInactiveUsers,
  reportUser,
  getReportedUsers
  // Add any other functions exported from user.controller.ts that you use in this routes file
}  from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/role.middleware';
import uploadMiddleware from '../middlewares/upload.middleware';
import auth from '../middlewares/auth.middleware';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';

const router: Router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

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
      searchUsers
);

/**
 * @route   GET api/users/suggestions
 * @desc    Get friend suggestions
 * @access  Private
 */
router.get('/suggestions', getFriendSuggestions);

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
  getUserProfile
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
  getUserById
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
  updateProfile
);

/**
 * @route   POST api/users/profile/picture
 * @desc    Upload profile picture
 * @access  Private
 */
router.post(
  '/profile/picture', 
  auth, 
  s3UploadMiddleware.profilePicture, 
  uploadProfilePicture
);

/**
 * @route   POST api/users/profile/cover  // Or /api/profile/cover depending on how this router is mounted
 * @desc    Upload cover photo
 * @access  Private
 */
router.post(
  '/profile/cover', // Or just '/cover' if this router is mounted at /api/users/profile or /api/profile
  auth, // Make sure auth middleware runs before upload if not applied globally to router
  s3UploadMiddleware.coverPhoto, // <--- CORRECTED: Use the specific coverPhoto multer instance
  uploadCoverPhoto             // Your controller function
);

/**
 * @route   GET api/users/friends
 * @desc    Get user's friends
 * @access  Private
 */
router.get('/friends', getFriends);

/**
 * @route   GET api/users/friend-requests
 * @desc    Get user's friend requests
 * @access  Private
 */
router.get('/friend-requests', getFriendRequests);

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
  sendFriendRequest
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
  acceptFriendRequest
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
  rejectFriendRequest
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
  removeFriend
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
  blockUser
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
  unblockUser
);

/**
 * @route   GET api/users/blocked
 * @desc    Get blocked users
 * @access  Private
 */
router.get('/blocked', getBlockedUsers);

/**
 * @route   GET api/users/online-friends
 * @desc    Get online friends
 * @access  Private
 */
router.get('/online-friends', getOnlineFriends);

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
  updatePrivacySettings
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
  getInactiveUsers
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
  reportUser
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
  getReportedUsers
);

export default router;