// src/controllers/notification.controller.ts
import { Request, Response } from 'express';
import Notification, { NotificationType, INotification } from '../models/Notification';
import mongoose from 'mongoose';

/**
 * @desc    Create a notification
 * @route   (Internal function, not exposed as an API endpoint)
 * @access  Private
 */
export const createNotification = async (
  recipientId: string,
  type: NotificationType,
  content: string,
  link: string,
  senderId?: string | null,
  relatedId?: mongoose.Types.ObjectId | string
): Promise<INotification | null> => {
  try {
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId || null,
      type,
      content,
      link,
      relatedId: relatedId || null,
      read: false
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

/**
 * @desc    Get user's notifications
 * @route   GET /api/notifications
 * @access  Private
 */
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === 'true';

    // Build query
    const query: any = { recipient: userId };
    if (unreadOnly) {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name username profileImage')
      .lean();

    const total = await Notification.countDocuments(query);
    
    // Get count of unread notifications for badge display
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false
    });

    return res.status(200).json({
      notifications,
      unreadCount,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Mark a notification as read
 * @route   PUT /api/notifications/:id/read
 * @access  Private
 */
export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const notification = await Notification.findOne({
      _id: id,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.read = true;
    await notification.save();

    return res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/read-all
 * @access  Private
 */
export const markAllNotificationsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    await Notification.updateMany(
      { recipient: userId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const notification = await Notification.findOne({
      _id: id,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await notification.deleteOne();

    return res.status(200).json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Delete all read notifications
 * @route   DELETE /api/notifications/clear-read
 * @access  Private
 */
export const clearReadNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await Notification.deleteMany({
      recipient: userId,
      read: true
    });

    return res.status(200).json({ 
      message: 'Read notifications cleared',
      count: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing read notifications:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get unread notification count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const count = await Notification.countDocuments({
      recipient: userId,
      read: false
    });

    return res.status(200).json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Send a test notification (for development purposes)
 * @route   POST /api/notifications/test
 * @access  Private (Dev/Admin only)
 */
export const sendTestNotification = async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: 'Not available in production' });
    }

    const userId = req.user?.id;
    const { type, content } = req.body;

    if (!Object.values(NotificationType).includes(type as NotificationType)) {
      return res.status(400).json({ message: 'Invalid notification type' });
    }

    const notification = await createNotification(
      userId,
      type as NotificationType,
      content || 'Test notification',
      '/notifications',
      null
    );

    return res.status(201).json({ 
      message: 'Test notification sent',
      notification
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};