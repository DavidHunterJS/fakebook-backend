import express, { Router, RequestHandler } from 'express';
import { body, param, query } from 'express-validator';
import * as postController from '../controllers/post.controller';
import reactionController, {getReactions} from '../controllers/reaction.controller'; 
import authMiddleware from '../middlewares/auth.middleware';
import { hasPermission } from '../middlewares/role.middleware';
import { Permission } from '../config/roles';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';
import { PostIdParam } from '../types/post.types';

const router: Router = express.Router();

// Apply auth middleware to all routes
router.use('/', authMiddleware);

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

// --- All other routes remain the same ---
router.post(
  '/',
  [
    hasPermission(Permission.CREATE_POST),
    s3UploadMiddleware.postMedia,
    body().custom((value, { req }) => {
      const text = req.body.text;
      const files = req.files as Express.Multer.File[];
      if ((!text || text.trim() === '') && (!files || files.length === 0)) {
        throw new Error('Post must contain either text or media');
      }
      return true;
    }),
    body('visibility').optional().isIn(['public', 'friends', 'private']),
  ],
  postController.createPost
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  postController.getFeedPosts
);

router.get(
  '/user/:userId',
  [
    param('userId').isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  postController.getUserPosts
);

router.get('/:id', [param('id').isMongoId()], postController.getPostById);

router.put<PostIdParam>(
  '/:id',
  s3UploadMiddleware.postMedia,
  [
    param('id').isMongoId(),
    body('text').optional().isString().trim(),
    body('visibility').optional().isIn(['public', 'friends', 'private']),
  ],
  postController.updatePost as RequestHandler<PostIdParam>
);

router.delete('/:id', [param('id').isMongoId()], postController.deletePost);

// --- Original reaction routes restored ---

router.get(
  '/:id/reactions',
  [
    param('id').isMongoId().withMessage('Invalid post ID')
  ],
  getReactions
);


router.post(
  '/:id/reactions',
  [
    param('id').isMongoId().withMessage('Invalid post ID'),
    body('type')
      .isString().withMessage('Reaction type must be a string')
      .trim()
      .toLowerCase()
      .isIn(Object.values(REACTION_TYPES))
      .withMessage(`Invalid reaction type. Must be one of: ${Object.values(REACTION_TYPES).join(', ')}`)
  ],
  reactionController.addOrUpdateReaction
);

router.delete(
  '/:id/reactions',
  [
    param('id').isMongoId().withMessage('Invalid post ID')
  ],
  reactionController.removeReaction
);


// --- UNCHANGED COMMENT AND OTHER ROUTES ---
router.get(
  '/:id/likes',
  [
    param('id').isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  postController.getPostLikes
);

router.post(
  '/:id/comment',
  [
    param('id').isMongoId(),
    body('text').isString().trim().notEmpty().withMessage('Comment text is required'),
  ],
  postController.addComment
);

router.get(
  '/:id/comments',
  [
    param('id').isMongoId(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  postController.getPostComments
);

router.put(
  '/comment/:commentId',
  [
    param('commentId').isMongoId(),
    body('text').isString().trim().notEmpty()
  ],
  postController.updateComment
);

router.delete(
  '/comment/:commentId',
  [param('commentId').isMongoId()],
  postController.deleteComment
);

router.post(
  '/comment/:commentId/like',
  [param('commentId').isMongoId()],
  postController.likeComment
);

router.delete(
  '/comment/:commentId/like',
  [param('commentId').isMongoId()],
  postController.unlikeComment
);

router.post(
  '/:id/share',
  [
    param('id').isMongoId(),
    body('text').optional().isString().trim(),
    body('visibility').optional().isIn(['public', 'friends', 'private'])
  ],
  postController.sharePost
);

export default router;
