// src/models/Comment.ts
import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../types/user.types';
import { IPost } from './Post';

/**
 * Interface for report reasons on comments
 */
export interface ICommentReportReason {
  user: IUser['_id'];
  reason: string;
  date: Date;
}

/**
 * Interface for comment replies
 */
export interface IReply extends Document {
  user: IUser['_id'];
  text: string;
  likes: IUser['_id'][];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for the Comment document
 */
export interface IComment extends Document {
  user: IUser['_id'];
  post: IPost['_id'];
  text: string;
  likes: IUser['_id'][];
  replies: IReply[];
  reported: boolean;
  reportReasons: ICommentReportReason[];
  createdAt: Date;
  updatedAt: Date;
  addReply(userId: string, text: string): Promise<IComment>;
  toggleLike(userId: string): Promise<IComment>;
  report(userId: string, reason: string): Promise<IComment>;
}

/**
 * Schema for reply objects within comments
 */
const ReplySchema = new Schema<IReply>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  { timestamps: true }
);

/**
 * Schema for the Comment model
 */
const CommentSchema = new Schema<IComment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    replies: [ReplySchema],
    reported: {
      type: Boolean,
      default: false
    },
    reportReasons: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reason: {
        type: String,
        required: true
      },
      date: {
        type: Date,
        default: Date.now
      }
    }]
  },
  { timestamps: true }
);

/**
 * Index for faster queries on post lookups
 */
CommentSchema.index({ post: 1, createdAt: -1 });

/**
 * Index for reported comments
 */
CommentSchema.index({ reported: 1, createdAt: -1 });

/**
 * Middleware to update post's comment count when a comment is added
 */
CommentSchema.post('save', async function(this: IComment) {
  try {
    const Post = mongoose.model('Post');
    await Post.findByIdAndUpdate(this.post, {
      $addToSet: { comments: this._id }
    });
  } catch (error) {
    console.error('Error updating post comment reference:', error);
  }
});

/**
 * Middleware to update post's comment list when a comment is removed
 * Use 'findOneAndDelete' instead of 'remove' which is deprecated
 */
CommentSchema.post('findOneAndDelete', async function(doc: IComment) {
  if (!doc) return;
  
  try {
    const Post = mongoose.model('Post');
    await Post.findByIdAndUpdate(doc.post, {
      $pull: { comments: doc._id }
    });
  } catch (error) {
    console.error('Error removing post comment reference:', error);
  }
});

/**
 * Virtual for comment reply count
 */
CommentSchema.virtual('replyCount').get(function(this: IComment) {
  return this.replies?.length || 0;
});

/**
 * Virtual for comment like count
 */
CommentSchema.virtual('likeCount').get(function(this: IComment) {
  return this.likes?.length || 0;
});

/**
 * Method to add a reply to a comment
 */
CommentSchema.methods.addReply = async function(userId: string, text: string): Promise<IComment> {
  this.replies.push({
    user: userId,
    text,
    likes: []
  });
  
  return this.save();
};

/**
 * Method to like/unlike a comment
 */
CommentSchema.methods.toggleLike = async function(userId: string): Promise<IComment> {
  const userIdStr = userId.toString();
  
  if (this.likes.some((id: mongoose.Types.ObjectId) => id.toString() === userIdStr)) {
    // User already liked this comment, so unlike it
    this.likes = this.likes.filter((id: mongoose.Types.ObjectId) => id.toString() !== userIdStr);
  } else {
    // User hasn't liked this comment yet, so add the like
    this.likes.push(userId);
  }
  
  return this.save();
};

/**
 * Method to report a comment
 */
CommentSchema.methods.report = async function(userId: string, reason: string): Promise<IComment> {
  // Check if user already reported this comment
  const alreadyReported = this.reportReasons.some(
    (report: ICommentReportReason) => report.user.toString() === userId.toString()
  );
  
  if (!alreadyReported) {
    this.reportReasons.push({
      user: userId,
      reason,
      date: new Date()
    });
    
    this.reported = true;
  }
  
  return this.save();
};

// Configure toJSON method to transform the document
CommentSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

// Configure toObject method for consistent formatting
CommentSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

const Comment = mongoose.model<IComment>('Comment', CommentSchema);

export default Comment;