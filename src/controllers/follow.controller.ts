// src/controllers/follow.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Follow } from '../models/Follow';
import User from '../models/User';
import { AuthenticatedS3Request } from '../types/request.types';

export class FollowController {
  
  /**
   * Follow a user
   */
  static async followUser(req: AuthenticatedS3Request, res: Response): Promise<void> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const { userId } = req.params;
      const followerId = req.user?.id;
      
      if (!followerId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      
      // Validation checks
      if (followerId === userId) {
        res.status(400).json({ success: false, message: 'Cannot follow yourself' });
        return;
      }
      
      // Check if target user exists
      const targetUser = await User.findById(userId).session(session);
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      // Check if already following
      const existingFollow = await Follow.findOne({
        follower: followerId,
        following: userId
      }).session(session);
      
      if (existingFollow) {
        res.status(400).json({ success: false, message: 'Already following this user' });
        return;
      }
      
      // Check if the target user has blocked the follower
      if (targetUser.blockedUsers.some(blockedId => blockedId.toString() === followerId)) {
        res.status(403).json({ success: false, message: 'Cannot follow this user' });
        return;
      }
      
      // Create follow relationship
      const newFollow = new Follow({
        follower: followerId,
        following: userId
      });
      
      await newFollow.save({ session });
      
      // Update counts atomically
      await User.findByIdAndUpdate(
        followerId,
        { $inc: { followingCount: 1 } },
        { session }
      );
      
      await User.findByIdAndUpdate(
        userId,
        { $inc: { followersCount: 1 } },
        { session }
      );
      
      await session.commitTransaction();
      
      res.status(201).json({
        success: true,
        message: 'Successfully followed user',
        data: {
          followId: newFollow._id,
          followedUser: {
            id: targetUser._id,
            username: targetUser.username,
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            profilePicture: targetUser.profilePicture
          }
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Follow user error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Unfollow a user
   */
  static async unfollowUser(req: AuthenticatedS3Request, res: Response): Promise<void> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const { userId } = req.params;
      const followerId = req.user?.id;
      
      if (!followerId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      
      // Find and delete the follow relationship
      const followRelation = await Follow.findOneAndDelete({
        follower: followerId,
        following: userId
      }, { session });
      
      if (!followRelation) {
        res.status(404).json({ success: false, message: 'Not following this user' });
        return;
      }
      
      // Update counts atomically
      await User.findByIdAndUpdate(
        followerId,
        { $inc: { followingCount: -1 } },
        { session }
      );
      
      await User.findByIdAndUpdate(
        userId,
        { $inc: { followersCount: -1 } },
        { session }
      );
      
      await session.commitTransaction();
      
      res.status(200).json({
        success: true,
        message: 'Successfully unfollowed user'
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Unfollow user error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get user's followers
   */
  static async getFollowers(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      
      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      // Get followers with pagination
      const followers = await Follow.find({ following: userId })
        .populate('follower', 'username firstName lastName profilePicture followersCount followingCount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const totalFollowers = await Follow.countDocuments({ following: userId });
      
      res.status(200).json({
        success: true,
        data: {
          followers: followers.map(follow => follow.follower),
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalFollowers / limit),
            totalCount: totalFollowers,
            hasNext: page < Math.ceil(totalFollowers / limit),
            hasPrev: page > 1
          }
        }
      });
      
    } catch (error) {
      console.error('Get followers error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  
  /**
   * Get users that a user is following
   */
  static async getFollowing(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      
      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      // Get following with pagination
      const following = await Follow.find({ follower: userId })
        .populate('following', 'username firstName lastName profilePicture followersCount followingCount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const totalFollowing = await Follow.countDocuments({ follower: userId });
      
      res.status(200).json({
        success: true,
        data: {
          following: following.map(follow => follow.following),
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalFollowing / limit),
            totalCount: totalFollowing,
            hasNext: page < Math.ceil(totalFollowing / limit),
            hasPrev: page > 1
          }
        }
      });
      
    } catch (error) {
      console.error('Get following error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  
  /**
   * Check if current user is following another user
   */
  static async checkFollowStatus(req: AuthenticatedS3Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id;
      
      if (!currentUserId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      
      const isFollowing = await Follow.findOne({
        follower: currentUserId,
        following: userId
      });
      
      res.status(200).json({
        success: true,
        data: {
          isFollowing: !!isFollowing,
          followId: isFollowing?._id || null
        }
      });
      
    } catch (error) {
      console.error('Check follow status error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  
  /**
   * Get mutual followers (users that both follow each other)
   */
  static async getMutualFollows(req: AuthenticatedS3Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id;
      
      if (!currentUserId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      
      // Find users that both currentUser and targetUser follow
      const currentUserFollowing = await Follow.find({ follower: currentUserId }).select('following');
      const targetUserFollowing = await Follow.find({ follower: userId }).select('following');
      
      const currentFollowingIds = currentUserFollowing.map(f => f.following.toString());
      const targetFollowingIds = targetUserFollowing.map(f => f.following.toString());
      
      const mutualFollowingIds = currentFollowingIds.filter(id => targetFollowingIds.includes(id));
      
      const mutualUsers = await User.find({
        _id: { $in: mutualFollowingIds }
      }).select('username firstName lastName profilePicture followersCount followingCount');
      
      res.status(200).json({
        success: true,
        data: {
          mutualFollows: mutualUsers,
          count: mutualUsers.length
        }
      });
      
    } catch (error) {
      console.error('Get mutual follows error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
  
  /**
   * Get suggested users to follow
   */
  static async getSuggestedUsers(req: AuthenticatedS3Request, res: Response): Promise<void> {
    try {
      const currentUserId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 10;
      
      if (!currentUserId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }
      
      // Get users that current user is already following
      const following = await Follow.find({ follower: currentUserId }).select('following');
      const followingIds = following.map(f => f.following.toString());
      followingIds.push(currentUserId); // Exclude self
      
      // Get users with most followers that current user is not following
      const suggestedUsers = await User.find({
        _id: { $nin: followingIds },
        isActive: true
      })
      .select('username firstName lastName profilePicture followersCount followingCount')
      .sort({ followersCount: -1 })
      .limit(limit);
      
      res.status(200).json({
        success: true,
        data: {
          suggestedUsers
        }
      });
      
    } catch (error) {
      console.error('Get suggested users error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}