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
  password: string;
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
}

export interface IUserPayload {
  id: string;
  role: Role;
}

export interface IAuthPayload {
  user: IUserPayload;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}