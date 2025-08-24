// src/models/ReadReceipt.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IReadReceipt extends Document {
  messageId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  readAt: Date;
  createdAt: Date;
}

const ReadReceiptSchema = new Schema<IReadReceipt>({
  messageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  readAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
ReadReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });
ReadReceiptSchema.index({ conversationId: 1, createdAt: -1 });
ReadReceiptSchema.index({ conversationId: 1, userId: 1, readAt: -1 });

export default mongoose.model<IReadReceipt>('ReadReceipt', ReadReceiptSchema);