// src/models/Post.ts
import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../types/user.types';

export interface IReportReason {
  user: IUser['_id'];
  reason: string;
  date: Date;
}

export interface IShare {
  user: IUser['_id'];
  date: Date;
}

export enum PostVisibility {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private'
}
export interface MediaItem {
  url: string;
  key: string;
  type: string;
  originalFilename?: string;
}
export interface IPost extends Document {
  user: IUser['_id'];
  text: string;
  media?: MediaItem[];
  visibility: PostVisibility;
  likes: IUser['_id'][];
  comments: mongoose.Types.ObjectId[];
  shares: IShare[];
  reported: boolean;
  reportReasons: IReportReason[];
  createdAt: Date;
  updatedAt: Date;
  pinned: Boolean,
  tags: mongoose.Types.ObjectId[];
  originalPost: { type: Schema.Types.ObjectId, ref: 'Post' },
  sharedFrom: { type: Schema.Types.ObjectId, ref: 'User' }
}
const MediaItemSchema = new Schema({
  url: { type: String, required: true },
  key: { type: String, required: true },
  type: { type: String, enum: ['image', 'video', 'audio', 'document'], default: 'image' },
  originalFilename: { type: String }
});
const PostSchema = new Schema<IPost>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true
    },
    media: [MediaItemSchema],
    visibility: {
      type: String,
      enum: Object.values(PostVisibility),
      default: PostVisibility.PUBLIC
    },
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    comments: [{
      type: Schema.Types.ObjectId,
      ref: 'Comment'
    }],
    shares: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      date: {
        type: Date,
        default: Date.now
      }
    }],
    tags: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    reported: {
      type: Boolean,
      default: false
    },
    reportReasons: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: {
        type: String
      },
      date: {
        type: Date,
        default: Date.now
      }
    }]
  },
  { timestamps: true }
);
PostSchema.index({ user: 1, pinned: -1, createdAt: -1 });
const Post = mongoose.model<IPost>('Post', PostSchema);

export default Post;