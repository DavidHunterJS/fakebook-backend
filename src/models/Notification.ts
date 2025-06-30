// src/models/Notification.ts
import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../types/user.types';

/**
 * Notification types enum
 */
export enum NotificationType {
  FRIEND_REQUEST = 'friend_request',
  FRIEND_ACCEPT = 'friend_accept',
  POST_LIKE = 'post_like',
  POST_COMMENT = 'post_comment',
  COMMENT_LIKE = 'comment_like',
  COMMENT_REPLY = 'comment_reply',
  MENTION = 'mention',
  SYSTEM = 'system',
  FRIEND_DECLINE = 'friend_decline'
}

/**
 * Interface for the Notification document
 */
export interface INotification extends Document {
  recipient: IUser['_id'];
  sender: IUser['_id'] | null;
  type: NotificationType;
  read: boolean;
  content: string;
  link: string;
  relatedId?: mongoose.Types.ObjectId; // ID of the related object (post, comment, etc.)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema for the Notification model
 */
const NotificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    content: {
      type: String,
      required: true
    },
    link: {
      type: String,
      required: true
    },
    relatedId: {
      type: Schema.Types.ObjectId,
      default: null
    }
  },
  { timestamps: true }
);

/**
 * Compound index for faster queries on unread notifications
 */
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

/**
 * Configure toJSON method to transform the document
 */
NotificationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

/**
 * Configure toObject method for consistent formatting
 */
NotificationSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;