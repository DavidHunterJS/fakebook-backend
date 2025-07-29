// models/Reaction.ts
import mongoose, { Document, Schema, Model } from 'mongoose';

// Define the reaction types with their corresponding emoji values
export const REACTION_TYPES = {
  LIKE: 'like',
  LOVE: 'love', 
  HAHA: 'haha',
  WOW: 'wow',
  SAD: 'sad',
  ANGRY: 'angry',
  CARE: 'care',
  CLAP: 'clap',
  FIRE: 'fire',
  THINKING: 'thinking',
  CELEBRATE: 'celebrate',
  MIND_BLOWN: 'mind_blown',
  HEART_EYES: 'heart_eyes',
  LAUGH_CRY: 'laugh_cry',
  SHOCKED: 'shocked',
  COOL: 'cool',
  PARTY: 'party',
  THUMBS_DOWN: 'thumbs_down'
} as const;

export type ReactionType = typeof REACTION_TYPES[keyof typeof REACTION_TYPES];

// TypeScript interface for the Reaction document
export interface IReaction extends Document {
  _id: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: ReactionType;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for creating a new reaction (without auto-generated fields)
export interface IReactionCreate {
  postId: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  type: ReactionType;
}

// Schema definition
const ReactionSchema = new Schema<IReaction>({
  postId: {
    type: Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Post ID is required'],
    index: true, // Index for fast lookups by post
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  type: {
    type: String,
    required: [true, 'Reaction type is required'],
    enum: {
      values: Object.values(REACTION_TYPES),
      message: 'Invalid reaction type. Must be one of: {VALUES}'
    },
    lowercase: true,
    trim: true,
  },
}, {
  timestamps: true,
  // Optimize JSON output
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Compound indexes for performance
ReactionSchema.index({ postId: 1, userId: 1 }, { 
  unique: true,
  name: 'post_user_unique' 
});

// Additional indexes for common queries
ReactionSchema.index({ userId: 1, createdAt: -1 }); // User's recent reactions
ReactionSchema.index({ postId: 1, type: 1 }); // Reactions by type for a post
ReactionSchema.index({ createdAt: -1 }); // Recent reactions globally

// Static methods for the model
ReactionSchema.statics = {
  // Get reaction counts for a specific post
  async getReactionCounts(postId: string | mongoose.Types.ObjectId) {
    const counts = await this.aggregate([
      { $match: { postId: new mongoose.Types.ObjectId(postId) } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Convert to object format
    const result: Record<ReactionType, number> = {
      like: 0,
      love: 0,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0,
      care: 0,
      clap: 0,
      fire: 0,
      thinking: 0,
      celebrate: 0,
      mind_blown: 0,
      heart_eyes: 0,
      laugh_cry: 0,
      shocked: 0,
      cool: 0,
      party: 0,
      thumbs_down: 0
    };
    
    counts.forEach(item => {
      result[item._id as ReactionType] = item.count;
    });
    
    return result;
  },

  // Get user's reaction for a specific post
  async getUserReaction(postId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId) {
    return await this.findOne({ postId, userId }).select('type');
  },

  // Get reaction counts for multiple posts (for feed optimization)
  async getMultiplePostReactionCounts(postIds: (string | mongoose.Types.ObjectId)[]) {
    const objectIds = postIds.map(id => new mongoose.Types.ObjectId(id));
    
    const counts = await this.aggregate([
      { $match: { postId: { $in: objectIds } } },
      { 
        $group: { 
          _id: { postId: '$postId', type: '$type' }, 
          count: { $sum: 1 } 
        } 
      },
      {
        $group: {
          _id: '$_id.postId',
          reactions: {
            $push: {
              type: '$_id.type',
              count: '$count'
            }
          },
          totalCount: { $sum: '$count' }
        }
      }
    ]);

    return counts.reduce((acc, item) => {
      const postId = item._id.toString();
      const reactionCounts: Record<ReactionType, number> = {
        like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0, care: 0,
        clap: 0,  fire: 0,  thinking: 0,  celebrate: 0,  mind_blown: 0,
        heart_eyes: 0,  laugh_cry: 0,  shocked: 0,  cool: 0,  party: 0,  thumbs_down: 0
      };
      
      item.reactions.forEach((reaction: any) => {
        reactionCounts[reaction.type as ReactionType] = reaction.count;
      });

      acc[postId] = {
        reactions: reactionCounts,
        total: item.totalCount
      };
      
      return acc;
    }, {} as Record<string, { reactions: Record<ReactionType, number>, total: number }>);
  }
};

// Instance methods
ReactionSchema.methods = {
  // Get emoji representation
  getEmoji(this: IReaction): string {
    const emojiMap: Record<ReactionType, string> = {
      like: '👍',
      love: '❤️',
      haha: '😂',
      wow: '😮',
      sad: '😢',
      angry: '😡',
      care: '🤗',
      clap: '👏',
      fire: '🔥',
      thinking: '🤔',
      celebrate: '🎉',
      mind_blown: '🤯',
      heart_eyes: '😍',
      laugh_cry: '😭',
      shocked: '😱',
      cool: '😎',
      party: '🥳',
      thumbs_down: '👎',
    };
    return emojiMap[this.type as ReactionType] || '👍';
  }
};

// Pre-save middleware for validation
ReactionSchema.pre('save', function(next) {
  // Additional validation can go here
  next();
});

// Post-save middleware for cache invalidation or real-time updates
ReactionSchema.post('save', function(doc) {
  // Here you could emit socket events for real-time updates
  // or invalidate caches
});

ReactionSchema.post('findOneAndDelete', function(doc) {
  // Clean up after reaction deletion
});

// Define the model interface with static methods
interface IReactionModel extends Model<IReaction> {
  getReactionCounts(postId: string | mongoose.Types.ObjectId): Promise<Record<ReactionType, number>>;
  getUserReaction(postId: string | mongoose.Types.ObjectId, userId: string | mongoose.Types.ObjectId): Promise<IReaction | null>;
  getMultiplePostReactionCounts(postIds: (string | mongoose.Types.ObjectId)[]): Promise<Record<string, { reactions: Record<ReactionType, number>, total: number }>>;
}

// Export the model
const Reaction: IReactionModel = (mongoose.models.Reaction || mongoose.model<IReaction, IReactionModel>('Reaction', ReactionSchema)) as IReactionModel;

export default Reaction;