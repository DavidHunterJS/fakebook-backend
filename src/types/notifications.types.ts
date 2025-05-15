// src/types/notification.types.ts
import { IUser } from './user.types';

export enum NotificationType {
  FRIEND_REQUEST = 'friend_request',
  FRIEND_ACCEPT = 'friend_accept',
  POST_LIKE = 'post_like',
  POST_COMMENT = 'post_comment',
  COMMENT_LIKE = 'comment_like',
  COMMENT_REPLY = 'comment_reply',
  MENTION = 'mention',
  SYSTEM = 'system'
}

export interface INotification {
  _id: string;
  recipient: string | IUser;
  sender: string | IUser | null;
  type: NotificationType;
  read: boolean;
  content: string;
  link: string;
  relatedId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationState {
  notifications: INotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}