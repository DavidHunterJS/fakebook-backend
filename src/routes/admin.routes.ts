// src/routes/admin.routes.ts
import express from 'express';
import * as adminController from '../controllers/admin.controller';
import authMiddleware from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/role.middleware';

const router = express.Router();

// Apply auth and admin middleware to all routes
router.use(authMiddleware, isAdmin);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/status', adminController.toggleUserStatus);
router.delete('/users/:id', adminController.deleteUser);

// Content moderation
router.get('/posts/reported', adminController.getReportedPosts);
router.delete('/posts/:id', adminController.deletePost);
router.get('/comments/reported', adminController.getReportedComments);
router.delete('/comments/:id', adminController.deleteComment);

// Analytics
router.get('/analytics/users', adminController.getUserAnalytics);
router.get('/analytics/content', adminController.getContentAnalytics);
router.get('/analytics/engagement', adminController.getEngagementAnalytics);

export default router;