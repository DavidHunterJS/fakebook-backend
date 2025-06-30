// src/controllers/friend.controller.ts
import { Request, Response } from 'express';
import Friend, { FriendshipStatus } from '../models/Friend';
import User from '../models/User';
import mongoose from 'mongoose';
import { NotificationService } from '../services/notification.service';
import getFileUrl  from '../middlewares/upload.middleware'; 

/**
 * @desc    Send a friend request
 * @route   POST /api/friends/request/:userId
 * @access  Private
 */
export const sendFriendRequest = async (req: Request, res: Response) => {
  try {
    const requesterId = req.user?.id;
    const recipientId = req.params.userId;
    const { userId } = req.params;

    // Check if users exist
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-friending
    if (requesterId === recipientId) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself' });
    }

    // Check if there's an existing relationship
    const existingFriendship = await Friend.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId }
      ]
    });

    if (existingFriendship) {
      if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
        return res.status(400).json({ message: 'You are already friends with this user' });
      }
      
      if (existingFriendship.status === FriendshipStatus.PENDING) {
        if (existingFriendship.requester.toString() === requesterId) {
          return res.status(400).json({ message: 'Friend request already sent' });
        } else {
          // If the other user already sent a request, accept it
          existingFriendship.status = FriendshipStatus.ACCEPTED;
          await existingFriendship.save();
          
          return res.status(200).json({ 
            message: 'Friend request accepted',
            friendship: existingFriendship
          });
        }
      }
      
      if (existingFriendship.status === FriendshipStatus.BLOCKED) {
        return res.status(400).json({ message: 'Unable to send friend request' });
      }
      
      if (existingFriendship.status === FriendshipStatus.DECLINED) {
        // Allow sending again after a previous decline
        existingFriendship.status = FriendshipStatus.PENDING;
        existingFriendship.requester = new mongoose.Types.ObjectId(requesterId);
        existingFriendship.recipient = new mongoose.Types.ObjectId(recipientId);
        await existingFriendship.save();
        
        return res.status(200).json({
          message: 'Friend request sent',
          friendship: existingFriendship
        });
      }
    }

    // Create new friend request
    const newFriendship = new Friend({
      requester: requesterId,
      recipient: recipientId,
      status: FriendshipStatus.PENDING
    });

    await newFriendship.save();

    // a notification for the recipient
    await NotificationService.friendRequest(requesterId, userId);

    return res.status(201).json({
      message: 'Friend request sent',
      friendship: newFriendship
    });
  } catch (error) {
    console.error('Error sending friend request:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Accept a friend request
 * @route   PUT /api/friends/accept/:userId
 * @access  Private
 */
export const acceptFriendRequest = async (req: Request, res: Response) => {
  try {
    const recipientId = req.user?.id;
    const requesterId = req.params.userId;
    const { userId } = req.params;
    const accepterId = req.user!.id;

    const friendship = await Friend.findOne({
      requester: requesterId,
      recipient: recipientId,
      status: FriendshipStatus.PENDING
    });

    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    friendship.status = FriendshipStatus.ACCEPTED;
    await friendship.save();

    //   Add notification after friend request is successfully accepted
    await NotificationService.friendAccept(accepterId, userId);
    return res.status(200).json({
      message: 'Friend request accepted',
      friendship
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Decline a friend request
 * @route   PUT /api/friends/decline/:userId
 * @access  Private
 */
export const declineFriendRequest = async (req: Request, res: Response) => {
  try {
    const recipientId = req.user?.id;
    const requesterId = req.params.userId;

    const friendship = await Friend.findOne({
      requester: requesterId,
      recipient: recipientId,
      status: FriendshipStatus.PENDING
    });

    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    friendship.status = FriendshipStatus.DECLINED;
    await friendship.save();

     
    await NotificationService.friendDecline(recipientId, requesterId);

    return res.status(200).json({
      message: 'Friend request declined',
      friendship
    });
  } catch (error) {
    console.error('Error declining friend request:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Cancel a sent friend request
 * @route   DELETE /api/friends/cancel/:userId
 * @access  Private
 */
export const cancelFriendRequest = async (req: Request, res: Response) => {
  try {
    const requesterId = req.user?.id;
    const recipientId = req.params.userId;

    const friendship = await Friend.findOne({
      requester: requesterId,
      recipient: recipientId,
      status: FriendshipStatus.PENDING
    });

    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    await friendship.deleteOne();

    return res.status(200).json({
      message: 'Friend request canceled'
    });
  } catch (error) {
    console.error('Error canceling friend request:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Unfriend a user
 * @route   DELETE /api/friends/:userId
 * @access  Private
 */
export const unfriendUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const friendId = req.params.userId;

    const friendship = await Friend.findOne({
      $or: [
        { requester: userId, recipient: friendId, status: FriendshipStatus.ACCEPTED },
        { requester: friendId, recipient: userId, status: FriendshipStatus.ACCEPTED }
      ]
    });

    if (!friendship) {
      return res.status(404).json({ message: 'Friendship not found' });
    }

    await friendship.deleteOne();

    return res.status(200).json({
      message: 'Friend removed successfully'
    });
  } catch (error) {
    console.error('Error unfriending user:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Block a user
 * @route   PUT /api/friends/block/:userId
 * @access  Private
 */
export const blockUser = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    const blockedId = req.params.userId;

    // Prevent self-blocking
    if (blockerId === blockedId) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    // Check if there's an existing relationship
    let friendship = await Friend.findOne({
      $or: [
        { requester: blockerId, recipient: blockedId },
        { requester: blockedId, recipient: blockerId }
      ]
    });

    if (friendship) {
      // Update existing relationship - make sure blocker is the requester
      if (friendship.requester.toString() !== blockerId) {
        // Swap the requester and recipient
        const temp = friendship.requester;
        friendship.requester = friendship.recipient;
        friendship.recipient = temp;
      }
      
      friendship.status = FriendshipStatus.BLOCKED;
      await friendship.save();
    } else {
      // Create new block relationship
      friendship = new Friend({
        requester: blockerId,
        recipient: blockedId,
        status: FriendshipStatus.BLOCKED
      });
      
      await friendship.save();
    }

    return res.status(200).json({
      message: 'User blocked successfully'
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Unblock a user
 * @route   PUT /api/friends/unblock/:userId
 * @access  Private
 */
export const unblockUser = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    const blockedId = req.params.userId;

    const friendship = await Friend.findOne({
      requester: blockerId,
      recipient: blockedId,
      status: FriendshipStatus.BLOCKED
    });

    if (!friendship) {
      return res.status(404).json({ message: 'Block relationship not found' });
    }

    await friendship.deleteOne();

    return res.status(200).json({
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Error unblocking user:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get all friends of a user
 * @route   GET /api/friends/
 * @access  Private
 */
export const getFriends = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Find friendships where the user is either requester or recipient and status is accepted
    const friendships = await Friend.find({
      $or: [
        { requester: userId, status: FriendshipStatus.ACCEPTED },
        { recipient: userId, status: FriendshipStatus.ACCEPTED }
      ]
    })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    // Extract friend IDs
    const friendIds = friendships.map(friendship => {
      return friendship.requester.toString() === userId.toString() 
        ? friendship.recipient 
        : friendship.requester;
    });

    // Get friend user details
    const friends = await User.find({ _id: { $in: friendIds } })
      .select('name profileImage profilePicture username bio')
      .lean();

    const total = await Friend.countDocuments({
      $or: [
        { requester: userId, status: FriendshipStatus.ACCEPTED },
        { recipient: userId, status: FriendshipStatus.ACCEPTED }
      ]
    });

    return res.status(200).json({
      friends,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting friends:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get pending friend requests (received)
 * @route   GET /api/friends/requests/pending
 * @access  Private
 */
export const getPendingRequests = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Find friendships where the user is the recipient and status is pending
    const friendships = await Friend.find({
      recipient: userId,
      status: FriendshipStatus.PENDING
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('requester', 'name profileImage profilePicture username bio')
      .lean();

    const total = await Friend.countDocuments({
      recipient: userId,
      status: FriendshipStatus.PENDING
    });

    return res.status(200).json({
      requests: friendships,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting pending requests:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get sent friend requests
 * @route   GET /api/friends/requests/sent
 * @access  Private
 */
export const getSentRequests = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Find friendships where the user is the requester and status is pending
    const friendships = await Friend.find({
      requester: userId,
      status: FriendshipStatus.PENDING
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('recipient', 'name profileImage profilePicture username bio')
      .lean();

    const total = await Friend.countDocuments({
      requester: userId,
      status: FriendshipStatus.PENDING
    });

    return res.status(200).json({
      requests: friendships,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting sent requests:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get blocked users
 * @route   GET /api/friends/blocked
 * @access  Private
 */
export const getBlockedUsers = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Find friendships where the user is the blocker
    const friendships = await Friend.find({
      requester: userId,
      status: FriendshipStatus.BLOCKED
    })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('recipient', 'name username profileImage profilePicture')
      .lean();

    const total = await Friend.countDocuments({
      requester: userId,
      status: FriendshipStatus.BLOCKED
    });

    return res.status(200).json({
      blockedUsers: friendships,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting blocked users:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get friendship status with a specific user
 * @route   GET /api/friends/status/:userId
 * @access  Private
 */
export const getFriendshipStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const otherUserId = req.params.userId;

    const status = await Friend.getFriendshipStatus(userId, otherUserId);

    return res.status(200).json({ status });
  } catch (error) {
    console.error('Error getting friendship status:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get mutual friends with another user
 * @route   GET /api/friends/mutual/:userId
 * @access  Private
 */
export const getMutualFriends = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const otherUserId = req.params.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get current user's friends
    const userFriendships = await Friend.find({
      $or: [
        { requester: userId, status: FriendshipStatus.ACCEPTED },
        { recipient: userId, status: FriendshipStatus.ACCEPTED }
      ]
    });

    const userFriendIds = userFriendships.map(friendship => 
      friendship.requester.toString() === userId.toString() 
        ? friendship.recipient.toString() 
        : friendship.requester.toString()
    );

    // Get other user's friends
    const otherUserFriendships = await Friend.find({
      $or: [
        { requester: otherUserId, status: FriendshipStatus.ACCEPTED },
        { recipient: otherUserId, status: FriendshipStatus.ACCEPTED }
      ]
    });

    const otherUserFriendIds = otherUserFriendships.map(friendship => 
      friendship.requester.toString() === otherUserId.toString() 
        ? friendship.recipient.toString() 
        : friendship.requester.toString()
    );

    // Find mutual friends
    const mutualFriendIds = userFriendIds.filter(id => otherUserFriendIds.includes(id));
    
    // Get mutual friend details with pagination
    const total = mutualFriendIds.length;
    const paginatedMutualFriendIds = mutualFriendIds.slice(skip, skip + limit);

    const mutualFriends = await User.find({ _id: { $in: paginatedMutualFriendIds } })
      .select('name profileImage username bio')
      .lean();

    return res.status(200).json({
      mutualFriends,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting mutual friends:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get friend suggestions
 * @route   GET /api/friends/suggestions
 * @access  Private
 */
export const getFriendSuggestions = async (req: Request, res: Response) => {
  console.log("You have entered the getFriendSuggestions function");
  
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get current user's friends
    const userFriendships = await Friend.find({
      $or: [
        { requester: userId, status: FriendshipStatus.ACCEPTED },
        { recipient: userId, status: FriendshipStatus.ACCEPTED }
      ]
    });

    const userFriendIds = userFriendships.map(friendship => 
      friendship.requester.toString() === userId.toString() 
        ? friendship.recipient 
        : friendship.requester
    );

    // Get users who are blocked or have blocked the current user
    const blockRelationships = await Friend.find({
      $or: [
        { requester: userId, status: FriendshipStatus.BLOCKED },
        { recipient: userId, status: FriendshipStatus.BLOCKED }
      ]
    });

    const blockedUserIds = blockRelationships.map(block => 
      block.requester.toString() === userId.toString() 
        ? block.recipient 
        : block.requester
    );

    // Exclude current user, friends, and blocked/blocking users
    const excludedIds = [
      new mongoose.Types.ObjectId(userId),
      ...userFriendIds,
      ...blockedUserIds
    ];

    // Find users who are friends with your friends (friends of friends)
    const friendsOfFriendships = await Friend.find({
      $or: [
        { requester: { $in: userFriendIds }, status: FriendshipStatus.ACCEPTED },
        { recipient: { $in: userFriendIds }, status: FriendshipStatus.ACCEPTED }
      ]
    });

    // Extract potential friend suggestions (friends of friends)
    let potentialFriends = new Set();
    
    friendsOfFriendships.forEach(friendship => {
      const friendId = friendship.requester.toString();
      const friendOfFriendId = friendship.recipient.toString();
      
      // If this is a friend of a friend and not already in excluded list
      if (userFriendIds.some(id => id.toString() === friendId) && 
          !excludedIds.some(id => id.toString() === friendOfFriendId)) {
        potentialFriends.add(friendOfFriendId);
      }
      
      // Check the other direction as well
      if (userFriendIds.some(id => id.toString() === friendOfFriendId) &&
          !excludedIds.some(id => id.toString() === friendId)) {
        potentialFriends.add(friendId);
      }
    });

    // If we don't have enough friends of friends, add some random users
    let suggestionIds = Array.from(potentialFriends).slice(0, limit);
    
    if (suggestionIds.length < limit) {
      // Find random users to fill the remaining slots
      const randomUsers = await User.aggregate([
        { $match: { _id: { $nin: excludedIds } } },
        { $sample: { size: limit - suggestionIds.length } },
        { $project: { _id: 1 } }
      ]);
      
      const randomUserIds = randomUsers.map(user => user._id.toString());
      suggestionIds = [...suggestionIds, ...randomUserIds];
    }

    // Get full user details for suggestions
    const suggestions = await User.find({ _id: { $in: suggestionIds } })
      .select('firstName profilePicture username bio')
      .limit(limit)
      .lean();

    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error('Error getting friend suggestions:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get recently active friends
 * @route   GET /api/friends/active
 * @access  Private
 */
export const getActiveFriends = async (req: Request, res: Response) => {
  console.log('--- Entered getActiveFriends Controller ---'); // Add entry log
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 15; // Limit how many to show

    if (!userId) {
      return res.status(401).json({ message: 'Authentication error: User ID missing.' });
    }

    // Define the time threshold for "active" (e.g., last 15 minutes)
    const activeThreshold = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

    // 1. Find all accepted friendships for the current user
    const friendships = await Friend.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: FriendshipStatus.ACCEPTED,
    }).select('requester recipient'); // Select only needed fields

    // 2. Extract the IDs of all friends
    const friendIds = friendships.map((friendship) =>
      friendship.requester.toString() === userId.toString()
        ? friendship.recipient
        : friendship.requester
    );

    // 3. Find friends who were active recently
    const activeFriends = await User.find({
      _id: { $in: friendIds }, // Must be a friend
      lastActive: { $gte: activeThreshold }, // Must be recently active
    })
      .sort({ lastActive: -1 }) // Show most recently active first
      .limit(limit)
      .select('firstName username profilePicture lastActive') // Select needed fields
      .lean(); // Use lean for performance

    console.log(`--- Exiting getActiveFriends: Found ${activeFriends.length} active friends ---`);
    return res.status(200).json({ activeFriends });

  } catch (error) {
    console.error('--- Error inside getActiveFriends Controller ---:', error);
    return res.status(500).json({ message: 'Server error while getting active friends' });
  }
};