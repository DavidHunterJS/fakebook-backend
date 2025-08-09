// src/models/Message.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IReaction {
  userId: mongoose.Types.ObjectId;
  emoji: string;
  timestamp: Date;
}

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: {
    text?: string;
    file?: {
      fileName: string;
      fileUrl: string;
      fileSize: number;
      fileType: string;
    };
    gif?: any;
  };
  messageType: 'text' | 'file' | 'gif' | 'system';
  timestamp: Date;
  reactions: IReaction[];
  isDeleted?: boolean;
  deletedBy?: mongoose.Types.ObjectId;
  deletedAt?: Date;
  editedAt?: Date;
  replyTo?: mongoose.Types.ObjectId;
}

const MessageSchema = new Schema<IMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    text: {
      type: String,
      maxlength: 5000
    },
    file: {
      fileName: String,
      fileUrl: String,
      fileSize: Number,
      fileType: String
    },
    gif: Schema.Types.Mixed
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'gif', 'system'],
    default: 'text',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  reactions: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    emoji: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: Date,
  editedAt: Date,
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
MessageSchema.index({ conversationId: 1, timestamp: -1 });
MessageSchema.index({ conversationId: 1, senderId: 1 });
MessageSchema.index({ conversationId: 1, isDeleted: 1, timestamp: -1 });

// Virtual for read receipts (to be populated from ReadReceipt collection)
MessageSchema.virtual('readBy', {
  ref: 'ReadReceipt',
  localField: '_id',
  foreignField: 'messageId'
});

// Ensure virtuals are included in JSON output
MessageSchema.set('toJSON', { virtuals: true });
MessageSchema.set('toObject', { virtuals: true });

export default mongoose.model<IMessage>('Message', MessageSchema);