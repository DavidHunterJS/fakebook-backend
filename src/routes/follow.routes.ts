// src/routes/follow.routes.ts
import { Router } from 'express';
import { FollowController } from '../controllers/follow.controller';
import  authenticate  from '../middlewares/auth.middleware';
import { validateObjectId } from '../middlewares/validation.middleware';

const router = Router();

/**
 * @route   POST /api/follows/:userId
 * @desc    Follow a user
 * @access  Private
 */
router.post('/:userId', 
  authenticate, 
  validateObjectId('userId'), 
  FollowController.followUser
);

/**
 * @route   DELETE /api/follows/:userId
 * @desc    Unfollow a user
 * @access  Private
 */
router.delete('/:userId', 
  authenticate, 
  validateObjectId('userId'), 
  FollowController.unfollowUser
);

/**
 * @route   GET /api/follows/:userId/followers
 * @desc    Get user's followers
 * @access  Public
 */
router.get('/:userId/followers', 
  validateObjectId('userId'), 
  FollowController.getFollowers
);

/**
 * @route   GET /api/follows/:userId/following
 * @desc    Get users that a user is following
 * @access  Public
 */
router.get('/:userId/following', 
  validateObjectId('userId'), 
  FollowController.getFollowing
);

/**
 * @route   GET /api/follows/:userId/status
 * @desc    Check if current user is following another user
 * @access  Private
 */
router.get('/:userId/status', 
  authenticate, 
  validateObjectId('userId'), 
  FollowController.checkFollowStatus
);

/**
 * @route   GET /api/follows/:userId/mutual
 * @desc    Get mutual follows between current user and target user
 * @access  Private
 */
router.get('/:userId/mutual', 
  authenticate, 
  validateObjectId('userId'), 
  FollowController.getMutualFollows
);

/**
 * @route   GET /api/follows/suggestions
 * @desc    Get suggested users to follow
 * @access  Private
 */
router.get('/suggestions', 
  authenticate, 
  FollowController.getSuggestedUsers
);

export default router;