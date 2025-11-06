// src/models/User.ts

import mongoose, { Schema, Model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Role, Permission } from '../config/roles';

// --- NEW Interface Definitions (Aligned with Design Doc) ---

// Sub-document for the new subscription model
export interface ISubscription {
  tier: 'Free' | 'Basic' | 'Pro';
  status: 'Active' | 'Cancelled' | 'Past Due';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  lastResetDate: Date;
}

// Sub-document for monthly and rollover credits
export interface ICredits {
  checksUsed: number;
  fixesUsed: number;
  checksRollover: number;
  fixesRollover: number;
}

// Sub-document for the Free tier's lifetime credits
export interface ILifetimeCredits {
  checksUsed: number;
  fixesUsed: number;
}

// Sub-document interfaces (unchanged)
export interface IPrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  friendsVisibility: 'public' | 'friends' | 'private';
  postsVisibility: 'public' | 'friends' | 'private';
}

export interface IUserReport extends Document {
  user: Types.ObjectId;
  reason: string;
  date: Date;
}


// --- MAIN USER INTERFACE (Refactored) ---
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
  createdAt: Date;
  updatedAt: Date;
  reports: Types.DocumentArray<IUserReport>;

  // --- NEW/UPDATED FIELDS ---
  subscription: ISubscription;
  credits: ICredits;
  lifetimeCredits: ILifetimeCredits;
}

// Interface for the User's instance methods (credit methods removed)
export interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  getDisplayName(): string;
  canLoginLocally(): boolean; 
}

// Interface for the User Model (static methods simplified)
export interface IUserModel extends Model<IUserDocument, {}, IUserMethods> {
  // Static methods can be added here if needed in the future
}
export type IUser = IUserDocument & IUserMethods & Document;


// --- Schema Definitions ---

const subscriptionSchema = new Schema<ISubscription>({
  tier: { type: String, enum: ['Free', 'Basic', 'Pro'], default: 'Free' },
  status: { type: String, enum: ['Active', 'Cancelled', 'Past Due'], default: 'Active' },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  lastResetDate: { type: Date, default: () => new Date() },
});

const creditsSchema = new Schema<ICredits>({
  checksUsed: { type: Number, default: 0, min: 0 },
  fixesUsed: { type: Number, default: 0, min: 0 },
  checksRollover: { type: Number, default: 0, min: 0 },
  fixesRollover: { type: Number, default: 0, min: 0 },
});

const lifetimeCreditsSchema = new Schema<ILifetimeCredits>({
  checksUsed: { type: Number, default: 0, min: 0 },
  fixesUsed: { type: Number, default: 0, min: 0 },
});

const UserSchema = new Schema<IUserDocument, IUserModel, IUserMethods>(
  {
    // --- Unchanged Fields ---
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
    reports: [{
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      date: { type: Date, default: Date.now }
    }],
    
    // --- NEW/UPDATED Schemas ---
    subscription: { type: subscriptionSchema, default: () => ({}) },
    credits: { type: creditsSchema, default: () => ({}) },
    lifetimeCredits: { type: lifetimeCreditsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// --- Indexes ---
UserSchema.index({ email: 1},{ unique: true });
UserSchema.index({ googleId: 1}, {unique: true, sparse: true });
UserSchema.index({ username: 1}, {unique: true });

// --- Middleware ---
UserSchema.pre('save', async function(next) {
    if (this.googleId) {
        this.authProvider = 'google';
        this.isOAuthUser = true;
        this.isEmailVerified = true;
        this.password = undefined;
    }
    
    // REMOVED: Obsolete middleware that set credits based on plan.
    // This logic now lives in the configuration file and service functions.
    
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

// --- Methods (Credit methods removed) ---
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.getDisplayName = function(): string {
  return `${this.firstName} ${this.lastName}`.trim();
};

UserSchema.methods.canLoginLocally = function(): boolean {
    return this.authProvider === 'local' && !!this.password;
};

// --- Model Export ---
const User = mongoose.models.User || mongoose.model<IUserDocument, IUserModel>('User', UserSchema);

export default User;