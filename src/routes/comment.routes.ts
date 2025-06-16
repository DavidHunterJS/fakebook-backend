// src/routes/comment.routes.ts
import express from 'express';
import auth from '../middlewares/auth.middleware';
import { isAdmin, isModerator, hasPermission } from '../middlewares/role.middleware';
import { Permission } from '../config/roles';
// ** CORRECTED IMPORT STYLE **
// Import the entire controller as a single object to prevent loading errors.
import * as commentController from '../controllers/comment.controller';

const router = express.Router();

// Base comment routes
router.post('/', auth, commentController.createComment);
router.get('/post/:postId', commentController.getPostComments);

// Admin/Moderator routes - MUST come before /:id route to avoid parameter conflicts
router.get('/reported', auth, isModerator, commentController.getReportedComments);

// Routes with :id parameter (must come after specific routes like /reported)
router.get('/:id', commentController.getCommentById);
router.put('/:id', auth, commentController.updateComment);
router.delete('/:id', auth, commentController.deleteComment);

// Like/unlike comment
router.put('/:id/like', auth, commentController.toggleLikeComment);

// Report comment
router.post('/:id/report', auth, commentController.reportComment);

// Reply routes
router.post('/:id/replies', auth, commentController.addReply);
router.delete('/:id/replies/:replyId', auth, commentController.deleteReply);
router.put('/:id/replies/:replyId/like', auth, commentController.toggleLikeReply);

export default router;