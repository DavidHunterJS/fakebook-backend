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
router.get('/:id', commentController.getCommentById);
router.put('/:id', auth, commentController.updateComment);
router.delete('/:id', auth, commentController.deleteComment);

// Like/unlike comment
router.put('/:id/like', auth, commentController.toggleLikeComment);

// Report comment
router.post('/:id/report', auth, commentController.reportComment);

// Admin/Moderator routes - Updated path to match controller comment
// ** CORRECTED to use the commentController object **
router.get('/reported', auth, isModerator, commentController.getReportedComments);

// Reply routes
router.post('/:id/replies', auth, commentController.addReply);
router.delete('/:id/replies/:replyId', auth, commentController.deleteReply);
router.put('/:id/replies/:replyId/like', auth, commentController.toggleLikeReply);

export default router;
