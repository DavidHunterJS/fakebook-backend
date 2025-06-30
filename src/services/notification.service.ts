// src/services/notification.service.ts
import Notification, { NotificationType, INotification } from '../models/Notification';
import User from '../models/User';
import { IUser } from '../types/user.types';
import mongoose from 'mongoose';

export class NotificationService {
  /**
   * Helper method to get full name from user
   */
  private static getFullName(user: { firstName?: string, lastName?: string }): string {
    if (!user) return 'Someone';
    
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (lastName) {
      return lastName;
    } else {
      return 'Someone';
    }
  }

  /**
   * Create a new notification
   */
  static async create(
    recipientId: string,
    type: NotificationType,
    content: string,
    link: string,
    senderId?: string | null,
    relatedId?: mongoose.Types.ObjectId | string
  ): Promise<INotification | null> {
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
  }

  /**
   * Send friend decline notification
   */
  static async friendDecline(declinerId: string, requesterId: string): Promise<INotification | null> {
    try {
      const decliner = await User.findById(declinerId).select('firstName lastName').lean();
      if (!decliner) return null;

      const declinerName = this.getFullName(decliner);

      // IMPORTANT: You will likely need to add `FRIEND_DECLINE` to your `NotificationType` enum
      // in the `src/models/Notification.ts` file for this to work without type errors.
      return this.create(
        requesterId, // The recipient of the notification is the original requester
        NotificationType.FRIEND_DECLINE, // Assumes this type exists in your enum
        `${declinerName} declined your friend request`,
        `/profile/${declinerId}`, // Link to the decliner's profile
        declinerId
      );
    } catch (error) {
      console.error('Error sending friend decline notification:', error);
      return null;
    }
  }

  /**
   * Send friend request notification
   */
  static async friendRequest(requesterId: string, recipientId: string): Promise<INotification | null> {
    try {
      const requester = await User.findById(requesterId).select('firstName lastName').lean();
      if (!requester) return null;

      const requesterName = this.getFullName(requester);

      return this.create(
        recipientId,
        NotificationType.FRIEND_REQUEST,
        `${requesterName} sent you a friend request`,
        '/friends/requests',
        requesterId
      );
    } catch (error) {
      console.error('Error sending friend request notification:', error);
      return null;
    }
  }

  /**
   * Send friend accept notification
   */
  static async friendAccept(accepterId: string, requesterId: string): Promise<INotification | null> {
    try {
      const accepter = await User.findById(accepterId).select('firstName lastName').lean();
      if (!accepter) return null;

      const accepterName = this.getFullName(accepter);

      return this.create(
        requesterId,
        NotificationType.FRIEND_ACCEPT,
        `${accepterName} accepted your friend request`,
        `/profile/${accepterId}`,
        accepterId
      );
    } catch (error) {
      console.error('Error sending friend accept notification:', error);
      return null;
    }
  }

  /**
   * Send post like notification
   */
  static async postLike(likerId: string, postAuthorId: string, postId: string): Promise<INotification | null> {
    try {
      // Don't notify if liking own post
      if (likerId === postAuthorId) return null;

      const liker = await User.findById(likerId).select('firstName lastName').lean();
      if (!liker) return null;

      const likerName = this.getFullName(liker);

      return this.create(
        postAuthorId,
        NotificationType.POST_LIKE,
        `${likerName} liked your post`,
        `/posts/${postId}`,
        likerId,
        postId
      );
    } catch (error) {
      console.error('Error sending post like notification:', error);
      return null;
    }
  }

  /**
   * Send post comment notification
   */
  static async postComment(commenterId: string, postAuthorId: string, postId: string, commentId: string): Promise<INotification | null> {
    try {
      // Don't notify if commenting on own post
      if (commenterId === postAuthorId) return null;

      const commenter = await User.findById(commenterId).select('firstName lastName').lean();
      if (!commenter) return null;

      const commenterName = this.getFullName(commenter);

      return this.create(
        postAuthorId,
        NotificationType.POST_COMMENT,
        `${commenterName} commented on your post`,
        `/posts/${postId}#comment-${commentId}`,
        commenterId,
        commentId
      );
    } catch (error) {
      console.error('Error sending post comment notification:', error);
      return null;
    }
  }

  /**
   * Send comment like notification
   */
  static async commentLike(likerId: string, commentAuthorId: string, postId: string, commentId: string): Promise<INotification | null> {
    try {
      // Don't notify if liking own comment
      if (likerId === commentAuthorId) return null;

      const liker = await User.findById(likerId).select('firstName lastName').lean();
      if (!liker) return null;

      const likerName = this.getFullName(liker);

      return this.create(
        commentAuthorId,
        NotificationType.COMMENT_LIKE,
        `${likerName} liked your comment`,
        `/posts/${postId}#comment-${commentId}`,
        likerId,
        commentId
      );
    } catch (error) {
      console.error('Error sending comment like notification:', error);
      return null;
    }
  }

  /**
   * Send comment reply notification
   */
  static async commentReply(
    replierId: string, 
    commentAuthorId: string, 
    postId: string, 
    commentId: string,
    replyId: string
  ): Promise<INotification | null> {
    try {
      // Don't notify if replying to own comment
      if (replierId === commentAuthorId) return null;

      const replier = await User.findById(replierId).select('firstName lastName').lean();
      if (!replier) return null;

      const replierName = this.getFullName(replier);

      return this.create(
        commentAuthorId,
        NotificationType.COMMENT_REPLY,
        `${replierName} replied to your comment`,
        `/posts/${postId}#comment-${commentId}-reply-${replyId}`,
        replierId,
        replyId
      );
    } catch (error) {
      console.error('Error sending comment reply notification:', error);
      return null;
    }
  }

  /**
   * Send mention notification
   */
  static async mention(mentionerId: string, mentionedId: string, postId: string): Promise<INotification | null> {
    try {
      // Don't notify if mentioning self
      if (mentionerId === mentionedId) return null;

      const mentioner = await User.findById(mentionerId).select('firstName lastName').lean();
      if (!mentioner) return null;

      const mentionerName = this.getFullName(mentioner);

      return this.create(
        mentionedId,
        NotificationType.MENTION,
        `${mentionerName} mentioned you in a post`,
        `/posts/${postId}`,
        mentionerId,
        postId
      );
    } catch (error) {
      console.error('Error sending mention notification:', error);
      return null;
    }
  }

  /**
   * Send system notification
   */
  static async system(recipientId: string, content: string, link: string = '/notifications'): Promise<INotification | null> {
    try {
      return this.create(
        recipientId,
        NotificationType.SYSTEM,
        content,
        link,
        null
      );
    } catch (error) {
      console.error('Error sending system notification:', error);
      return null;
    }
  }

  /**
   * Send bulk system notification to multiple users
   */
  static async bulkSystem(recipientIds: string[], content: string, link: string = '/notifications'): Promise<number> {
    try {
      const notifications = recipientIds.map(recipientId => ({
        recipient: recipientId,
        type: NotificationType.SYSTEM,
        content,
        link,
        read: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const result = await Notification.insertMany(notifications);
      return result.length;
    } catch (error) {
      console.error('Error sending bulk system notification:', error);
      return 0;
    }
  }
}