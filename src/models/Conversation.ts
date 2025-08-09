// src/models/Conversation.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IConversationParticipant {
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'member';
  joinedAt: Date;
  permissions?: {
    canDeleteMessages: boolean;
    canKickUsers: boolean;
    canChangeSettings: boolean;
    canAddMembers: boolean;
  };
}

export interface IConversationSettings {
  allowFileSharing: boolean;
  allowGifs: boolean;
  maxFileSize: number; // in bytes
  allowedFileTypes: string[];
  isPublic: boolean;
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  participants: IConversationParticipant[];
  type: 'direct' | 'group';
  name?: string;
  avatar?: string;
  settings: IConversationSettings;
  encryptionKeys?: {
    publicKey: string;
  };
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationParticipantSchema = new Schema<IConversationParticipant>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['admin', 'member'], 
    default: 'member' 
  },
  joinedAt: { 
    type: Date, 
    default: Date.now 
  },
  permissions: {
    canDeleteMessages: { type: Boolean, default: false },
    canKickUsers: { type: Boolean, default: false },
    canChangeSettings: { type: Boolean, default: false },
    canAddMembers: { type: Boolean, default: false }
  }
});

const ConversationSettingsSchema = new Schema<IConversationSettings>({
  allowFileSharing: { type: Boolean, default: true },
  allowGifs: { type: Boolean, default: true },
  maxFileSize: { type: Number, default: 50 * 1024 * 1024 }, // 50MB
  allowedFileTypes: [{ type: String }],
  isPublic: { type: Boolean, default: false }
});

const ConversationSchema = new Schema<IConversation>({
  participants: [ConversationParticipantSchema],
  type: { 
    type: String, 
    enum: ['direct', 'group'], 
    required: true 
  },
  name: { 
    type: String, 
    required: function(this: IConversation) { 
      return this.type === 'group'; 
    } 
  },
  avatar: String,
  settings: {
    type: ConversationSettingsSchema,
    default: () => ({})
  },
  encryptionKeys: {
    publicKey: String
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Indexes for performance
ConversationSchema.index({ "participants.userId": 1, lastActivity: -1 });
ConversationSchema.index({ type: 1, "participants.userId": 1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);