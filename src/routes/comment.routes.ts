// src/routes/comment.routes.ts
import express from 'express';
import  auth  from '../middlewares/auth.middleware';
import { isAdmin, isModerator, hasPermission } from '../middlewares/role.middleware';
import { Permission } from '../config/roles';
import {
  createComment,
  getPostComments,
  getCommentById,
  updateComment,
  deleteComment,
  toggleLikeComment,
  addReply,
  deleteReply,
  toggleLikeReply,
  reportComment,
  getReportedComments
} from '../controllers/comment.controller';

const router = express.Router();

// Base comment routes
router.post('/', auth, createComment);
router.get('/post/:postId', getPostComments);
router.get('/:id', getCommentById);
router.put('/:id', auth, updateComment);
router.delete('/:id', auth, deleteComment);

// Like/unlike comment
router.put('/:id/like', auth, toggleLikeComment);

// Report comment
router.post('/:id/report', auth, reportComment);

// Admin/Moderator routes
router.get('/admin/reported', auth, isModerator, getReportedComments);

// Reply routes
router.post('/:id/replies', auth, addReply);
router.delete('/:id/replies/:replyId', auth, deleteReply);
router.put('/:id/replies/:replyId/like', auth, toggleLikeReply);

export default router;