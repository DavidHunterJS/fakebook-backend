// models/Follow.ts
import mongoose, { Schema, Document } from 'mongoose';

interface IFollow extends Document {
  follower: mongoose.Types.ObjectId; // User who follows
  following: mongoose.Types.ObjectId; // User being followed
  createdAt: Date;
}

const followSchema = new Schema<IFollow>({
  follower: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  following: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to prevent duplicate follows and optimize queries
followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ follower: 1 });
followSchema.index({ following: 1 });

export const Follow = mongoose.model<IFollow>('Follow', followSchema);