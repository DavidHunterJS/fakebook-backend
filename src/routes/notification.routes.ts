// src/routes/notification.routes.ts
import express from 'express';
import  auth  from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/role.middleware';
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
  getUnreadCount,
  sendTestNotification
} from '../controllers/notification.controller';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Get notifications
router.get('/', getUserNotifications);
router.get('/unread-count', getUnreadCount);

// Update notifications
router.put('/:id/read', markNotificationRead);
router.put('/read-all', markAllNotificationsRead);

// Delete notifications
router.delete('/:id', deleteNotification);
router.delete('/clear-read', clearReadNotifications);

// Test route (development only)
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', sendTestNotification);
}

// Add the default export
export default router;