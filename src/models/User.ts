// src/models/User.ts

import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Role, Permission } from '../config/roles';



// A helper type to handle populated fields
type Populated<M, K extends keyof M> = Omit<M, K> & {
  [P in K]: Exclude<M[P], Types.ObjectId[] | Types.ObjectId>
}


// --- Interface Definitions ---

export interface IUserReport extends Document {
  user: Types.ObjectId;
  reason: string;
  date: Date;
}

// Sub-document interfaces
export interface IPrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  friendsVisibility: 'public' | 'friends' | 'private';
  postsVisibility: 'public' | 'friends' | 'private';
}

export interface ISubscriptionInfo {
  plan: 'starter' | 'growth' | 'pro';
  creditsPerMonth: number;
  monthlyLimit: number;
  resetDate: Date;
  lastResetDate: Date;
}

export interface IWorkflowStats {
  totalWorkflows: number;
  productEnhancements: number;
  lifestyleScenes: number;
  productVariants: number;
  totalCreditsUsed: number;
  lastWorkflowDate?: Date;
}

export interface ICreditTransaction extends Document {
  amount: number;
  type: 'deduct' | 'add' | 'refund';
  reason: string;
  workflowJobId?: string;
  date: Date;
}

// 1. Interface for the User's data attributes (the document shape)
export interface IUserDocument {
  username: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
  coverPhoto: string;
  bio: string;
  location: string;
  birthday?: Date;
  role: Role;
  isActive: boolean;
  friends: Types.ObjectId[] | IUser[];
  friendRequests: Types.ObjectId[] | IUser[];
  sentRequests: Types.ObjectId[] | IUser[];
  blockedUsers: Types.ObjectId[]  | IUser[];
  followingCount: number;
  followersCount: number;
  lastActive: Date;
  isOnline: boolean;
  privacySettings: IPrivacySettings;
  isReported: boolean;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  isEmailVerified: boolean;
  savedPosts: Types.ObjectId[];
  permissions: Permission[];
  googleId?: string;
  authProvider: 'local' | 'google';
  isOAuthUser: boolean;
  creditsRemaining: number;
  creditsTotal: number;
  subscription: ISubscriptionInfo;
  workflowStats: IWorkflowStats;
  creditTransactions: Types.DocumentArray<ICreditTransaction>;
  createdAt: Date;
  updatedAt: Date;
  reports: Types.DocumentArray<IUserReport>;
}

// 2. Interface for the User's instance methods
export interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  getDisplayName(): string;
  hasEnoughCredits(requiredCredits: number): boolean;
  deductCredits(amount: number, reason: string, workflowJobId?: string): Promise<void>;
  addCredits(amount: number, reason: string): Promise<void>;
  resetMonthlyCredits(): Promise<void>;
  updateWorkflowStats(workflowType: 'product_enhancement' | 'lifestyle_scenes' | 'product_variants'): Promise<void>;
  canLoginLocally(): boolean; 
  refundCredits(amount: number, reason: string, workflowJobId?: string): Promise<void>;
}

// 3. Interface for the User Model's static methods
export interface IUserModel extends Model<IUserDocument, {}, IUserMethods> {
  resetAllMonthlyCredits(): Promise<number>;
}
export type IUser = IUserDocument & IUserMethods & Document;
// --- Schema Definitions ---

const CreditTransactionSchema = new Schema<ICreditTransaction>({
  amount: { type: Number, required: true },
  type: { type: String, enum: ['deduct', 'add', 'refund'], required: true },
  reason: { type: String, required: true },
  workflowJobId: { type: String },
  date: { type: Date, default: Date.now }
});

const UserSchema = new Schema<IUserDocument, IUserModel, IUserMethods>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    profilePicture: { type: String, default: 'default-avatar.png' },
    coverPhoto: { type: String, default: 'default-cover.png' },
    bio: { type: String, default: '', maxLength: 500 },
    location: { type: String, default: '' },
    birthday: { type: Date },
    role: { type: String, enum: Object.values(Role), default: Role.USER },
    isActive: { type: Boolean, default: true },
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    sentRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    followingCount: { type: Number, default: 0, min: 0 },
    followersCount: { type: Number, default: 0, min: 0 },
    lastActive: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    privacySettings: {
      profileVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
      friendsVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
      postsVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' }
    },
    isReported: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    isEmailVerified: { type: Boolean, default: false },
    savedPosts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
    permissions: [{ type: String, enum: Object.values(Permission) }],
    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    isOAuthUser: { type: Boolean, default: false },
    creditsRemaining: { type: Number, default: 100, min: 0 },
    creditsTotal: { type: Number, default: 100 },
    creditTransactions: [CreditTransactionSchema],
    subscription: {
      plan: { type: String, enum: ['starter', 'growth', 'pro'], default: 'starter' },
      creditsPerMonth: { type: Number, default: 100 },
      monthlyLimit: { type: Number, default: 100 },
      resetDate: { type: Date, default: () => new Date(new Date().setMonth(new Date().getMonth() + 1, 1)) },
      lastResetDate: { type: Date, default: Date.now }
    },
    reports: [{
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      date: { type: Date, default: Date.now }
    }],
    workflowStats: {
      totalWorkflows: { type: Number, default: 0 },
      productEnhancements: { type: Number, default: 0 },
      lifestyleScenes: { type: Number, default: 0 },
      productVariants: { type: Number, default: 0 },
      totalCreditsUsed: { type: Number, default: 0 },
      lastWorkflowDate: { type: Date }
    }
  },
  { timestamps: true }
);

// --- Indexes ---
UserSchema.index({ email: 1},{ unique: true });
UserSchema.index({ googleId: 1}, {unique: true, sparse: true });
UserSchema.index({ username: 1}, {unique: true });
UserSchema.index({ 'subscription.resetDate': 1 });

// --- Middleware ---
UserSchema.pre('save', async function(next) {
    if (this.googleId) {
        this.authProvider = 'google';
        this.isOAuthUser = true;
        this.isEmailVerified = true;
        this.password = undefined;
    }

    if (this.isModified('subscription.plan')) {
        const creditLimits = { starter: 100, growth: 500, pro: 2000 };
        this.subscription.creditsPerMonth = creditLimits[this.subscription.plan];
        this.subscription.monthlyLimit = creditLimits[this.subscription.plan];
    }
    
    if (this.isModified('password') && this.password) {
        try {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        } catch (error) {
            return next(error as Error);
        }
    }
    
    next();
});

// --- Methods ---
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.getDisplayName = function(): string {
  return `${this.firstName} ${this.lastName}`.trim();
};

UserSchema.methods.hasEnoughCredits = function(requiredCredits: number): boolean {
  return this.creditsRemaining >= requiredCredits;
};

UserSchema.methods.deductCredits = async function(amount: number, reason: string, workflowJobId?: string): Promise<void> {
  if (this.creditsRemaining < amount) throw new Error('Insufficient credits');
  
  this.creditsRemaining -= amount;
  this.workflowStats.totalCreditsUsed += amount;
  
  this.creditTransactions.push({ amount: -amount, type: 'deduct', reason, workflowJobId, date: new Date() });
  await this.save();
};

UserSchema.methods.addCredits = async function(amount: number, reason: string): Promise<void> {
  this.creditsRemaining += amount;
  this.creditsTotal += amount;
  this.creditTransactions.push({ amount, type: 'add', reason, date: new Date() });
  await this.save();
};

UserSchema.methods.resetMonthlyCredits = async function(): Promise<void> {
    const now = new Date();
    if (now >= this.subscription.resetDate) {
        this.creditsRemaining = this.subscription.creditsPerMonth;
        this.subscription.lastResetDate = now;
        
        const nextReset = new Date(now);
        nextReset.setMonth(nextReset.getMonth() + 1);
        nextReset.setDate(1);
        this.subscription.resetDate = nextReset;
        
        this.creditTransactions.push({ amount: this.subscription.creditsPerMonth, type: 'add', reason: 'Monthly credit reset', date: now });
        await this.save();
    }
};

UserSchema.methods.updateWorkflowStats = async function(workflowType: 'product_enhancement' | 'lifestyle_scenes' | 'product_variants'): Promise<void> {
    this.workflowStats.totalWorkflows++;
    this.workflowStats.lastWorkflowDate = new Date();
    
    switch (workflowType) {
        case 'product_enhancement': this.workflowStats.productEnhancements++; break;
        case 'lifestyle_scenes': this.workflowStats.lifestyleScenes++; break;
        case 'product_variants': this.workflowStats.productVariants++; break;
    }
    await this.save();
};

// --- Static Methods ---
UserSchema.statics.resetAllMonthlyCredits = async function(): Promise<number> {
  const now = new Date();
  const usersToReset = await this.find({ 'subscription.resetDate': { $lte: now } });

  await Promise.all(
    usersToReset.map((user: IUserDocument & IUserMethods) => user.resetMonthlyCredits())
  );

  return usersToReset.length;
};

// --- Model Export ---
const User = mongoose.model<IUserDocument, IUserModel>('User', UserSchema);

export default User;