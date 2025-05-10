// src/models/User.ts
import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types/user.types';
import { Role, Permission } from '../config/roles';

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    profilePicture: { type: String, default: 'default-avatar.png' },
    coverPhoto: { type: String, default: 'default-cover.png' },
    bio: { type: String, default: '' },
    location: { type: String, default: '' },
    birthday: { type: Date },
    role: { 
      type: String, 
      enum: Object.values(Role), 
      default: Role.USER 
    },
    isActive: { type: Boolean, default: true },
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    sentRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastActive: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    privacySettings: {
      profileVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
      friendsVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
      postsVisibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' }
    },
    reports: [{
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      date: { type: Date, default: Date.now }
    }],
    isReported: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    isEmailVerified: { type: Boolean, default: false },
    savedPosts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
    permissions: [{ type: String, enum: Object.values(Permission) }]
  },
  { timestamps: true }
);

// Pre-save middleware to hash password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

export default User;