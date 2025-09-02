// src/types/user.types.ts
import { Document } from 'mongoose';
import mongoose from 'mongoose';
import { Role, Permission } from '../config/roles';

export interface IUserReport {
  user: mongoose.Types.ObjectId | string;
  reason: string;
  date: Date;
}

export interface IPrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  friendsVisibility: 'public' | 'friends' | 'private';
  postsVisibility: 'public' | 'friends' | 'private';
}

export interface IUserBase {
  username: string;
  email: string;
  password?: string; // Made optional for OAuth users
  firstName: string;
  lastName: string;
  profilePicture?: string;
  coverPhoto?: string;
  bio?: string;
  location?: string;
  birthday?: Date;
  role: Role;
  isActive: boolean;
  friends: string[] | IUser[];
  friendRequests: string[] | IUser[];
  sentRequests: string[] | IUser[];
  blockedUsers: string[] | IUser[];
  lastActive: Date;
  isOnline?: boolean;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  isEmailVerified: boolean;
  followingCount: number;
  followersCount: number;
  googleId?: string;
  authProvider: 'local' | 'google';
  isOAuthUser: boolean;
}

export interface IUser extends IUserBase, Document {
  savedPosts: mongoose.Types.ObjectId[];
  permissions?: Permission[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  isOnline: boolean;
  privacySettings: IPrivacySettings;
  reports: IUserReport[];
  isReported: boolean;
  canLoginLocally(): boolean;
  getDisplayName(): string;
}

export interface IUserPayload {
  id: string;
  role: Role;
  authProvider?: 'local' | 'google'; // Optional: useful for frontend logic
}

export interface IAuthPayload {
  user: IUserPayload;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

// Additional type for OAuth user creation
export interface IGoogleUserData {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  isEmailVerified?: boolean;
}

// Type for user registration that handles both local and OAuth
export interface IUserRegistration {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password?: string; // Optional for OAuth users
  googleId?: string; // Optional for local users
  authProvider?: 'local' | 'google';
  profilePicture?: string;
}

// Type for login responses that includes auth method info
export interface ILoginResponse {
  user: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
    role: Role;
    authProvider: 'local' | 'google';
    isOAuthUser: boolean;
  };
  token?: string; // If using JWT tokens
  message: string;
}