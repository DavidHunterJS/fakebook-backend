// src/routes/post.routes.ts
import express, { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as postController from '../controllers/post.controller';
import authMiddleware from '../middlewares/auth.middleware';
import uploadMiddleware from '../middlewares/upload.middleware';
import { hasPermission } from '../middlewares/role.middleware';
import { Permission } from '../config/roles';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';
import { FileWithS3 } from '../types/file.types';

const router: Router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);


router.post(
  '/',
  [
    hasPermission(Permission.CREATE_POST),
    s3UploadMiddleware.postMedia,
    // ** CORRECTED VALIDATION LOGIC **
    // This custom validator ensures a post is not completely empty,
    // allowing for posts with only text, only media, or both.
    body().custom((value, { req }) => {
      const text = req.body.text;
      const files = req.files as Express.Multer.File[];

      if ((!text || text.trim() === '') && (!files || files.length === 0)) {
        throw new Error('Post must contain either text or media');
      }
      return true; // Validation passed
    }),
    body('visibility')
      .optional()
      .isIn(['public', 'friends', 'private'])
      .withMessage('Visibility must be public, friends, or private')
  ],
  postController.createPost
);



/**
 * @route   GET api/posts
 * @desc    Get all posts for feed
 * @access  Private
 */
router.get(
  '/',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  postController.getFeedPosts
);

/**
 * @route   GET api/posts/user/:userId
 * @desc    Get posts by user
 * @access  Private
 */
router.get(
  '/user/:userId',
  [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  postController.getUserPosts
);

/**
 * @route   GET api/posts/:id
 * @desc    Get post by ID
 * @access  Private
 */
router.get(
  '/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.getPostById
);

/**
 * @route   PUT api/posts/:id
 * @desc    Update a post
 * @access  Private
 */
router.put(
  '/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    body('text')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Post text must be between 1 and 5000 characters'),
    body('visibility')
      .optional()
      .isIn(['public', 'friends', 'private'])
      .withMessage('Visibility must be public, friends, or private')
  ],
  postController.updatePost
);

/**
 * @route   DELETE api/posts/:id
 * @desc    Delete a post
 * @access  Private
 */
router.delete(
  '/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.deletePost
);

/**
 * @route   POST api/posts/:id/like
 * @desc    Like a post
 * @access  Private
 */
router.post(
  '/:id/like',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.likePost
);

/**
 * @route   DELETE api/posts/:id/like
 * @desc    Unlike a post
 * @access  Private
 */
router.delete(
  '/:id/like',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.unlikePost
);

/**
 * @route   GET api/posts/:id/likes
 * @desc    Get users who liked a post
 * @access  Private
 */
router.get(
  '/:id/likes',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  postController.getPostLikes
);

/**
 * @route   POST api/posts/:id/comment
 * @desc    Add a comment to a post
 * @access  Private
 */
router.post(
  '/:id/comment',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    body('text')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Comment text is required')
      .isLength({ max: 1000 })
      .withMessage('Comment cannot exceed 1000 characters')
  ],
  postController.addComment
);

/**
 * @route   GET api/posts/:id/comments
 * @desc    Get comments for a post
 * @access  Private
 */
router.get(
  '/:id/comments',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  postController.getPostComments
);

/**
 * @route   PUT api/posts/comment/:commentId
 * @desc    Update a comment
 * @access  Private
 */
router.put(
  '/comment/:commentId',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID'),
    body('text')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Comment text is required')
      .isLength({ max: 1000 })
      .withMessage('Comment cannot exceed 1000 characters')
  ],
  postController.updateComment
);

/**
 * @route   DELETE api/posts/comment/:commentId
 * @desc    Delete a comment
 * @access  Private
 */
router.delete(
  '/comment/:commentId',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID')
  ],
  postController.deleteComment
);

/**
 * @route   POST api/posts/comment/:commentId/like
 * @desc    Like a comment
 * @access  Private
 */
router.post(
  '/comment/:commentId/like',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID')
  ],
  postController.likeComment
);

/**
 * @route   DELETE api/posts/comment/:commentId/like
 * @desc    Unlike a comment
 * @access  Private
 */
router.delete(
  '/comment/:commentId/like',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID')
  ],
  postController.unlikeComment
);

/**
 * @route   POST api/posts/:id/share
 * @desc    Share a post
 * @access  Private
 */
router.post(
  '/:id/share',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    body('text')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Share text cannot exceed 1000 characters'),
    body('visibility')
      .optional()
      .isIn(['public', 'friends', 'private'])
      .withMessage('Visibility must be public, friends, or private')
  ],
  postController.sharePost
);

/**
 * @route   POST api/posts/:id/report
 * @desc    Report a post
 * @access  Private
 */
router.post(
  '/:id/report',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    body('reason')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Report reason is required')
      .isLength({ max: 500 })
      .withMessage('Report reason cannot exceed 500 characters')
  ],
  postController.reportPost
);

/**
 * @route   POST api/posts/comment/:commentId/report
 * @desc    Report a comment
 * @access  Private
 */
router.post(
  '/comment/:commentId/report',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID'),
    body('reason')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Report reason is required')
      .isLength({ max: 500 })
      .withMessage('Report reason cannot exceed 500 characters')
  ],
  postController.reportComment
);

/**
 * @route   GET api/posts/saved
 * @desc    Get saved posts
 * @access  Private
 */
router.get(
  '/saved',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  postController.getSavedPosts
);

/**
 * @route   POST api/posts/:id/save
 * @desc    Save a post
 * @access  Private
 */
router.post(
  '/:id/save',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.savePost
);

/**
 * @route   DELETE api/posts/:id/save
 * @desc    Unsave a post
 * @access  Private
 */
router.delete(
  '/:id/save',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.unsavePost
);

/**
 * @route   GET api/posts/trending
 * @desc    Get trending posts
 * @access  Private
 */
router.get(
  '/trending',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  postController.getTrendingPosts
);

/**
 * @route   POST api/posts/comment/:commentId/reply
 * @desc    Reply to a comment
 * @access  Private
 */
router.post(
  '/comment/:commentId/reply',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID'),
    body('text')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Reply text is required')
      .isLength({ max: 1000 })
      .withMessage('Reply cannot exceed 1000 characters')
  ],
  postController.replyToComment
);

/**
 * @route   GET api/posts/comment/:commentId/replies
 * @desc    Get replies to a comment
 * @access  Private
 */
router.get(
  '/comment/:commentId/replies',
  [
    param('commentId')
      .isMongoId()
      .withMessage('Invalid comment ID')
  ],
  postController.getCommentReplies
);

/**
 * @route   GET api/posts/admin/reported
 * @desc    Get reported posts (admin only)
 * @access  Private/Admin
 */
router.get(
  '/admin/reported',
  [
    hasPermission(Permission.EDIT_ANY_POST),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  postController.getReportedPosts
);

/**
 * @route   POST api/posts/:id/pin
 * @desc    Pin post to profile
 * @access  Private
 */
router.post(
  '/:id/pin',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.pinPost
);

/**
 * @route   DELETE api/posts/:id/pin
 * @desc    Unpin post from profile
 * @access  Private
 */
router.delete(
  '/:id/pin',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  postController.unpinPost
);

/**
 * @route   POST api/posts/:id/tag
 * @desc    Tag users in a post
 * @access  Private
 */
router.post(
  '/:id/tag',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    body('userIds')
      .isArray()
      .withMessage('UserIds must be an array'),
    body('userIds.*')
      .isMongoId()
      .withMessage('Invalid user ID in tags array')
  ],
  postController.tagUsers
);

/**
 * @route   DELETE api/posts/:id/tag/:userId
 * @desc    Remove user tag from post
 * @access  Private
 */
router.delete(
  '/:id/tag/:userId',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID')
  ],
  postController.removeUserTag
);

export default router;