// src/models/Friend.ts
import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../types/user.types';

/**
 * Friend request status enum
 */
export enum FriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  BLOCKED = 'blocked'
}

/**
 * Interface for the Friend document
 */
export interface IFriend extends Document {
  requester: IUser['_id']; // User who sent the friend request
  recipient: IUser['_id']; // User who received the friend request
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema for the Friend model
 */
const FriendSchema = new Schema<IFriend>(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: Object.values(FriendshipStatus),
      default: FriendshipStatus.PENDING,
      required: true
    }
  },
  { timestamps: true }
);

/**
 * Compound index for faster queries on requester/recipient pairs
 * Also ensures uniqueness for each relationship
 */
FriendSchema.index({ requester: 1, recipient: 1 }, { unique: true });

/**
 * Index for finding all relationships by user (either requester or recipient)
 */
FriendSchema.index({ requester: 1, status: 1 });
FriendSchema.index({ recipient: 1, status: 1 });

/**
 * Index for finding all pending requests
 */
FriendSchema.index({ status: 1, createdAt: -1 });

/**
 * Utility static method to check if users are friends
 */
FriendSchema.statics.areFriends = async function(userId1: string, userId2: string): Promise<boolean> {
  const count = await this.countDocuments({
    $or: [
      { requester: userId1, recipient: userId2, status: FriendshipStatus.ACCEPTED },
      { requester: userId2, recipient: userId1, status: FriendshipStatus.ACCEPTED }
    ]
  });
  
  return count > 0;
};

/**
 * Utility static method to get friendship status between users
 */
FriendSchema.statics.getFriendshipStatus = async function(userId1: string, userId2: string): Promise<string | null> {
  const friendship = await this.findOne({
    $or: [
      { requester: userId1, recipient: userId2 },
      { requester: userId2, recipient: userId1 }
    ]
  });
  
  if (!friendship) return null;
  
  if (friendship.status === FriendshipStatus.ACCEPTED) {
    return FriendshipStatus.ACCEPTED;
  }
  
  if (friendship.status === FriendshipStatus.BLOCKED) {
    // Return 'blocked' only if the current user is the one who blocked
    return friendship.requester.toString() === userId1 ? FriendshipStatus.BLOCKED : 'blocked_by_other';
  }
  
  if (friendship.status === FriendshipStatus.PENDING) {
    // Differentiate between sent and received requests
    return friendship.requester.toString() === userId1 ? 'pending_sent' : 'pending_received';
  }
  
  return friendship.status;
};

/**
 * Configure toJSON to transform the document
 */
FriendSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

// Create model interface with statics
interface IFriendModel extends mongoose.Model<IFriend> {
  areFriends(userId1: string, userId2: string): Promise<boolean>;
  getFriendshipStatus(userId1: string, userId2: string): Promise<string | null>;
}

const Friend = mongoose.model<IFriend, IFriendModel>('Friend', FriendSchema);

export default Friend;