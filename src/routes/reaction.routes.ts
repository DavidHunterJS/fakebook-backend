// src/routes/post.routes.ts
import express, { Router } from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middlewares/auth.middleware';
const router: Router = express.Router();
import reactionController from '../controllers/reaction.controller'

// Apply auth middleware to all routes
router.use('/',authMiddleware);

const REACTION_TYPES = {
  LIKE: 'like',
  LOVE: 'love', 
  HAHA: 'haha',
  WOW: 'wow',
  SAD: 'sad',
  ANGRY: 'angry',
  CARE: 'care',
  CLAP: 'clap',
  FIRE: 'fire',
  THINKING: 'thinking',
  CELEBRATE: 'celebrate',
  MIND_BLOWN: 'mind_blown',
  HEART_EYES: 'heart_eyes',
  LAUGH_CRY: 'laugh_cry',
  SHOCKED: 'shocked',
  COOL: 'cool',
  PARTY: 'party',
  THUMBS_DOWN: 'thumbs_down'
} as const;


/**
 * @route   POST api/posts/:id/reactions
 * @desc    Add or update a reaction to a post
 * @access  Private
 */
router.post(
  '/:id/reactions',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID'),
    body('type')
      .isString()
      .withMessage('Reaction type must be a string')
      .trim()
      .toLowerCase()
      .isIn(Object.values(REACTION_TYPES))
      .withMessage(`Invalid reaction type. Must be one of: ${Object.values(REACTION_TYPES).join(', ')}`)
  ],
  reactionController.addOrUpdateReaction as express.RequestHandler
);

/**
 * @route   DELETE api/posts/:id/reactions
 * @desc    Remove a reaction from a post
 * @access  Private
 */
router.delete(
  '/:id/reactions',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid post ID')
  ],
  reactionController.removeReaction as express.RequestHandler
);