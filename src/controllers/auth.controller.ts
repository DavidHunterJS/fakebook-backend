// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import User from '../models/User';
import Post from '../models/Post';
import Comment from '../models/Comment';
import { Role } from '../config/roles';
import { IUser, IAuthPayload } from '../types/user.types';
import dotenv from 'dotenv';
dotenv.config();

// JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@yourfacebookclone.com';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// Google OAuth client
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Email transport configuration
const transporter = nodemailer.createTransport({
  // Configure for your email provider
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Generate JWT token
 */
const generateToken = (user: IUser): string => {
  const payload: IAuthPayload = {
    user: {
      id: user.id,
      role: user.role
    }
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};


/**
 * @route   POST api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
export const register = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, firstName, lastName } = req.body;

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      return res.status(400).json({ 
        message: 'User already exists with that email or username' 
      });
    }

    // Create verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create new user
    user = new User({
      username,
      email,
      password, // Will be hashed in pre-save hook
      firstName,
      lastName,
      verificationToken,
      verificationTokenExpires,
      isEmailVerified: false
    });

    await user.save();

    // Send verification email
    const verificationUrl = `${CLIENT_URL}/verify-email/${verificationToken}`;
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify your email address',
      html: `
        <p>Hi ${firstName},</p>
        <p>Thank you for registering! Please verify your email by clicking the link below:</p>
        <p><a href="${verificationUrl}">Verify Email</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you did not create an account, please ignore this email.</p>
      `
    });

    // Generate token
    const token = generateToken(user);
    
    return res.status(201).json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      },
      message: 'Registration successful. Please check your email to verify your account.'
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    // Update last login timestamp
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);
    
    return res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/auth/me
 * @desc    Get current user
 * @access  Private
 */
export const getMe = async (req: Request, res: Response): Promise<Response> => {
  try {
    // User is already attached to req by auth middleware
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.json(user);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   PUT api/auth/password
 * @desc    Change password
 * @access  Private
 */
export const changePassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 */
export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal user existence, just return success message
      return res.json({ message: 'If an account exists with that email, a password reset link has been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Create password reset URL
    const resetUrl = `${CLIENT_URL}/reset-password/${resetToken}`;

    // Send email
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <p>Hi ${user.firstName},</p>
        <p>You requested a password reset. Please click the link below to reset your password:</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      `
    });

    return res.json({ message: 'If an account exists with that email, a password reset link has been sent' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/reset-password/:token
 * @desc    Reset password using token
 * @access  Public
 */
export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;
    const { token } = req.params;

    // Find user by reset token and check if token is expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired' });
    }

    // Update password and clear reset token fields
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Send confirmation email
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Your password has been changed',
      html: `
        <p>Hi ${user.firstName},</p>
        <p>This is a confirmation that the password for your account ${user.email} has just been changed.</p>
      `
    });

    return res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/auth/verify/:token
 * @desc    Verify user email
 * @access  Public
 */
export const verifyEmail = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token } = req.params;

    // Find user by verification token and check if token is expired
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Verification token is invalid or has expired' });
    }

    // Update user verification status
    user.isEmailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/resend-verification
 * @desc    Resend verification email
 * @access  Private
 */
export const resendVerification = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await user.save();

    // Send verification email
    const verificationUrl = `${CLIENT_URL}/verify-email/${verificationToken}`;
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Verify your email address',
      html: `
        <p>Hi ${user.firstName},</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verificationUrl}">Verify Email</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you did not create an account, please ignore this email.</p>
      `
    });

    return res.json({ message: 'Verification email sent' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/oauth/google
 * @desc    Authenticate with Google
 * @access  Public
 */
export const googleAuth = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { idToken } = req.body;

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { email, name, given_name, family_name, picture, sub } = payload;
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user with Google data
      const username = `user_${sub.substring(0, 8)}`;
      
      user = new User({
        username,
        email,
        firstName: given_name || name?.split(' ')[0] || '',
        lastName: family_name || name?.split(' ').slice(1).join(' ') || '',
        profilePicture: picture || 'default-avatar.png',
        password: crypto.randomBytes(20).toString('hex'), // Random password since they'll use Google to login
        isEmailVerified: true // Google already verified the email
      });
      
      await user.save();
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    // Update user's last active timestamp
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);
    
    return res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/oauth/facebook
 * @desc    Authenticate with Facebook
 * @access  Public
 */
export const facebookAuth = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { accessToken, userId } = req.body;
    
    // Verify Facebook token
    const fbResponse = await axios.get(
      `https://graph.facebook.com/v13.0/${userId}`,
      {
        params: {
          fields: 'id,email,first_name,last_name,picture',
          access_token: accessToken
        }
      }
    );
    
    if (!fbResponse.data || !fbResponse.data.email) {
      return res.status(400).json({ message: 'Invalid Facebook data' });
    }
    
    const { email, first_name, last_name, id, picture } = fbResponse.data;
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user with Facebook data
      const username = `user_${id.substring(0, 8)}`;
      
      user = new User({
        username,
        email,
        firstName: first_name,
        lastName: last_name,
        profilePicture: picture?.data?.url || 'default-avatar.png',
        password: crypto.randomBytes(20).toString('hex'), // Random password since they'll use Facebook to login
        isEmailVerified: true // Facebook already verified the email
      });
      
      await user.save();
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    // Update user's last active timestamp
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);
    
    return res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/auth/logout
 * @desc    Logout user (useful for tracking session state on server)
 * @access  Private
 */
export const logout = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Update last active time
    await User.findByIdAndUpdate(req.user.id, {
      lastActive: new Date(),
      isOnline: false
    });

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/auth/delete-account
 * @desc    Delete user account
 * @access  Private
 */
export const deleteAccount = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { password } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Password is incorrect' });
    }

    // Delete all user's posts
    await Post.deleteMany({ user: user._id });

    // Delete all user's comments
    await Comment.deleteMany({ user: user._id });

    // Remove user from friends lists
    await User.updateMany(
      { friends: user._id },
      { $pull: { friends: user._id } }
    );

    // Remove user from friend requests
    await User.updateMany(
      { friendRequests: user._id },
      { $pull: { friendRequests: user._id } }
    );

    await User.updateMany(
      { sentRequests: user._id },
      { $pull: { sentRequests: user._id } }
    );

    // Delete user
    await user.deleteOne();

    return res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};
