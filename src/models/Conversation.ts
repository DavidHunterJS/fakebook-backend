// models/Conversation.ts
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversation extends Document {
  _id: Types.ObjectId;
  type: 'direct' | 'group' | 'workflow_chat';
  participants: Array<{
    userId: Types.ObjectId;
    role: 'admin' | 'member' | 'viewer';
    joinedAt: Date;
    leftAt?: Date;
    isActive: boolean;
  }>;
  title?: string; // For group chats
  description?: string;
  avatar?: string;
  lastMessage?: {
    messageId: Types.ObjectId;
    content: string;
    senderId: Types.ObjectId;
    sentAt: Date;
  };
  encryptionSettings?: {
    isEncrypted: boolean;
    encryptionType: 'none' | 'aes' | 'signal';
    keyId?: string; // Reference to encryption key
  };
  workflowContext?: {
    workflowId: Types.ObjectId;
    projectId: Types.ObjectId;
    step: string;
  };
  settings: {
    allowFileSharing: boolean;
    allowImageSharing: boolean;
    autoDeleteAfter?: number; // hours
    isArchived: boolean;
    muteUntil?: Date;
  };
  unreadCount: Array<{
    userId: Types.ObjectId;
    count: number;
  }>;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
  type: {
    type: String,
    enum: ['direct', 'group', 'workflow_chat'],
    required: true
  },
  participants: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  title: {
    type: String,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  avatar: String,
  lastMessage: {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    content: String,
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: Date
  },
  encryptionSettings: {
    isEncrypted: {
      type: Boolean,
      default: false
    },
    encryptionType: {
      type: String,
      enum: ['none', 'aes', 'signal'],
      default: 'none'
    },
    keyId: String
  },
  workflowContext: {
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow'
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project'
    },
    step: String
  },
  settings: {
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowImageSharing: {
      type: Boolean,
      default: true
    },
    autoDeleteAfter: Number,
    isArchived: {
      type: Boolean,
      default: false
    },
    muteUntil: Date
  },
  unreadCount: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance
ConversationSchema.index({ 'participants.userId': 1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ 'workflowContext.workflowId': 1 });
ConversationSchema.index({ updatedAt: -1 });

// Compound index for user's active conversations
ConversationSchema.index({ 
  'participants.userId': 1, 
  'participants.isActive': 1,
  'settings.isArchived': 1 
});

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);