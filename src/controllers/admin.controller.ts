// src/controllers/admin.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Post from '../models/Post';
import Comment from '../models/Comment';
import { Role } from '../config/roles';

interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
}

interface AnalyticsTimeframe {
  startDate?: string;
  endDate?: string;
}

/**
 * Get all users with pagination and search
 */
export const getAllUsers = async (req: Request<{}, {}, {}, PaginationQuery>, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    
    const query = search 
      ? { 
          $or: [
            { username: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } }
          ] 
        } 
      : {};
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await User.countDocuments(query);
    
    return res.json({
      users,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request<{id: string}>, res: Response): Promise<Response> => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('friends', 'firstName lastName username profilePicture')
      .populate('friendRequests', 'firstName lastName username profilePicture')
      .populate('sentRequests', 'firstName lastName username profilePicture');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.json(user);
  } catch (err) {
    console.error((err as Error).message);
    
    // Check if ID is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    return res.status(500).send('Server error');
  }
};

/**
 * Update user role
 */
export const updateUserRole = async (req: Request<{id: string}, {}, {role: Role}>, res: Response): Promise<Response> => {
  try {
    const { role } = req.body;
    
    if (!Object.values(Role).includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent admin from changing their own role
    if (user._id.toString() === req.user?.id && role !== Role.ADMIN) {
      return res.status(400).json({ message: 'Cannot change your own admin role' });
    }
    
    user.role = role;
    await user.save();
    
    return res.json({ message: 'User role updated', user });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Toggle user active status
 */
export const toggleUserStatus = async (req: Request<{id: string}>, res: Response): Promise<Response> => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent admin from deactivating themselves
    if (user._id.toString() === req.user?.id) {
      return res.status(400).json({ message: 'Cannot deactivate your own account' });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    return res.json({ 
      message: `User ${user.isActive ? 'activated' : 'deactivated'}`, 
      user 
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Delete user
 */
export const deleteUser = async (req: Request<{id: string}>, res: Response): Promise<Response> => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user?.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    // Delete all user's posts
    await Post.deleteMany({ user: user._id });
    
    // Delete all user's comments
    await Comment.deleteMany({ user: user._id });
    
    // Remove user from friends lists of other users
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
    
    return res.json({ message: 'User and all associated data deleted' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Get reported posts
 */
export const getReportedPosts = async (req: Request<{}, {}, {}, PaginationQuery>, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;
    
    const posts = await Post.find({ reported: true })
      .populate('user', 'firstName lastName username profilePicture')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Post.countDocuments({ reported: true });
    
    return res.json({
      posts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Delete post
 */
export const deletePost = async (req: Request<{id: string}>, res: Response): Promise<Response> => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Delete all comments on this post
    await Comment.deleteMany({ post: post._id });
    
    // Delete the post
    await post.deleteOne();
    
    return res.json({ message: 'Post and all associated comments deleted' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Get reported comments
 */
export const getReportedComments = async (req: Request<{}, {}, {}, PaginationQuery>, res: Response): Promise<Response> => {
  try {
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;
    
    const comments = await Comment.find({ reported: true })
      .populate('user', 'firstName lastName username profilePicture')
      .populate('post', 'text')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Comment.countDocuments({ reported: true });
    
    return res.json({
      comments,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Delete comment
 */
export const deleteComment = async (req: Request<{id: string}>, res: Response): Promise<Response> => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Remove comment reference from post
    await Post.updateOne(
      { _id: comment.post },
      { $pull: { comments: comment._id } }
    );
    
    // Delete the comment
    await comment.deleteOne();
    
    return res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Get user analytics
 */
export const getUserAnalytics = async (req: Request<{}, {}, {}, AnalyticsTimeframe>, res: Response): Promise<Response> => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Users created over time
    const newUsers = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Active users count
    const activeUsers = await User.countDocuments({
      lastActive: { $gte: new Date(new Date().setDate(new Date().getDate() - 7)) }
    });
    
    // User role distribution
    const roles = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Age distribution if birthdays are available
    const ageGroups = await User.aggregate([
      {
        $match: {
          birthday: { $exists: true, $ne: null }
        }
      },
      {
        $project: {
          age: {
            $floor: {
              $divide: [
                { $subtract: [new Date(), '$birthday'] },
                (365.25 * 24 * 60 * 60 * 1000)
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lt: ['$age', 18] }, then: '<18' },
                { case: { $lt: ['$age', 25] }, then: '18-24' },
                { case: { $lt: ['$age', 35] }, then: '25-34' },
                { case: { $lt: ['$age', 45] }, then: '35-44' },
                { case: { $lt: ['$age', 55] }, then: '45-54' },
              ],
              default: '55+'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    return res.json({
      totalUsers: await User.countDocuments(),
      activeUsers,
      newUsers,
      roles,
      ageGroups
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Get content analytics
 */
export const getContentAnalytics = async (req: Request<{}, {}, {}, AnalyticsTimeframe>, res: Response): Promise<Response> => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Posts created over time
    const posts = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Comments over time
    const comments = await Comment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Media type distribution in posts
    const mediaTypes = await Post.aggregate([
      {
        $match: {
          'media.0': { $exists: true }
        }
      },
      {
        $project: {
          hasImage: {
            $cond: [
              { $gt: [{ $size: { $filter: { input: '$media', as: 'item', cond: { $regexMatch: { input: '$$item', regex: /\.(jpg|jpeg|png|gif)$/i } } } } }, 0] },
              1,
              0
            ]
          },
          hasVideo: {
            $cond: [
              { $gt: [{ $size: { $filter: { input: '$media', as: 'item', cond: { $regexMatch: { input: '$$item', regex: /\.(mp4|avi|mov|wmv)$/i } } } } }, 0] },
              1,
              0
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          withImages: { $sum: '$hasImage' },
          withVideos: { $sum: '$hasVideo' }
        }
      }
    ]);
    
    // Reported content
    const reportedContent = {
      posts: await Post.countDocuments({ reported: true }),
      comments: await Comment.countDocuments({ reported: true })
    };
    
    return res.json({
      totalPosts: await Post.countDocuments(),
      totalComments: await Comment.countDocuments(),
      posts,
      comments,
      mediaTypes: mediaTypes[0] || { totalPosts: 0, withImages: 0, withVideos: 0 },
      reportedContent
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * Get engagement analytics
 */
export const getEngagementAnalytics = async (req: Request<{}, {}, {}, AnalyticsTimeframe>, res: Response): Promise<Response> => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Likes over time
    const likes = await Post.aggregate([
      {
        $match: {
          updatedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          likeCount: { $size: '$likes' }
        }
      },
      {
        $group: {
          _id: '$date',
          count: { $sum: '$likeCount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Friend connections
    const friendships = await User.aggregate([
      {
        $project: {
          friendCount: { $size: '$friends' }
        }
      },
      {
        $group: {
          _id: null,
          totalFriendships: { $sum: '$friendCount' },
          avgFriendsPerUser: { $avg: '$friendCount' },
          maxFriends: { $max: '$friendCount' },
          minFriends: { $min: '$friendCount' }
        }
      }
    ]);
    
    // Most engaged users
    const topUsers = await User.aggregate([
      {
        $lookup: {
          from: 'posts',
          localField: '_id',
          foreignField: 'user',
          as: 'posts'
        }
      },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'user',
          as: 'comments'
        }
      },
      {
        $project: {
          _id: 1,
          username: 1,
          firstName: 1,
          lastName: 1,
          postCount: { $size: '$posts' },
          commentCount: { $size: '$comments' },
          totalEngagement: { $add: [{ $size: '$posts' }, { $size: '$comments' }] }
        }
      },
      {
        $sort: { totalEngagement: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    // Most popular posts
    const topPosts = await Post.aggregate([
      {
        $project: {
          text: 1,
          user: 1,
          createdAt: 1,
          likeCount: { $size: '$likes' },
          commentCount: { $size: '$comments' },
          shareCount: { $size: '$shares' },
          totalInteractions: { 
            $add: [
              { $size: '$likes' }, 
              { $size: '$comments' },
              { $size: '$shares' }
            ] 
          }
        }
      },
      {
        $sort: { totalInteractions: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: '$userInfo'
      },
      {
        $project: {
          text: 1,
          likeCount: 1,
          commentCount: 1,
          shareCount: 1,
          totalInteractions: 1,
          createdAt: 1,
          user: {
            _id: '$userInfo._id',
            username: '$userInfo.username',
            firstName: '$userInfo.firstName',
            lastName: '$userInfo.lastName'
          }
        }
      }
    ]);
    
    return res.json({
      likes,
      friendships: friendships[0] || { totalFriendships: 0, avgFriendsPerUser: 0 },
      topUsers,
      topPosts
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};