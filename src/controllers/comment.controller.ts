// src/controllers/comment.controller.ts
import { Request, Response } from 'express';
import Comment, { IComment } from '../models/Comment';
import Post from '../models/Post';
import mongoose from 'mongoose';
import { NotificationService } from '../services/notification.service';

/**
 * @desc    Create a new comment
 * @route   POST /api/comments
 * @access  Private
 */
export const createComment = async (req: Request, res: Response) => {
  try {
    const { postId, text } = req.body;
    const userId = req.user?.id;
    

    if (!postId || !text) {
      return res.status(400).json({ message: 'Post ID and comment text are required' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = new Comment({
      user: userId,
      post: postId,
      text,
      likes: [],
      replies: []
    });

    await comment.save();

    // Populate user details
    const populatedComment = await Comment.findById(comment._id)
      .populate('user', 'name profileImage')
      .lean();

    return res.status(201).json(populatedComment);
  } catch (error) {
    console.error('Error creating comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get comments for a post
 * @route   GET /api/comments/post/:postId
 * @access  Public
 */
export const getPostComments = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({ post: postId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username profileImage profilePicture')
      .populate('replies.user', 'username profileImage profilePicture')
      .lean();

    const total = await Comment.countDocuments({ post: postId });

    return res.status(200).json({
      comments,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get a single comment by ID
 * @route   GET /api/comments/:id
 * @access  Public
 */
export const getCommentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id)
      .populate('user', 'name profileImage')
      .populate('replies.user', 'name profileImage')
      .lean();

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    return res.status(200).json(comment);
  } catch (error) {
    console.error('Error fetching comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Update a comment
 * @route   PUT /api/comments/:id
 * @access  Private
 */
export const updateComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user?.id;

    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check comment ownership
    if (comment.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to update this comment' });
    }

    comment.text = text;
    await comment.save();

    const updatedComment = await Comment.findById(id)
      .populate('user', 'name profileImage')
      .populate('replies.user', 'name profileImage')
      .lean();

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error('Error updating comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Delete a comment
 * @route   DELETE /api/comments/:id
 * @access  Private
 */
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isAdmin = req.user?.isAdmin;

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check comment ownership or admin status
    if (comment.user.toString() !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    await Comment.findByIdAndDelete(id);

    return res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Like/Unlike a comment
 * @route   PUT /api/comments/:commentId/like
 * @access  Private
 */
export const toggleLikeComment = async (req: Request, res: Response) => {
  try {
    // Use commentId from params (not both id and commentId)
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Get comment with null check
    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Get post AFTER confirming comment exists
    const post = await Post.findById(comment.post);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Toggle the like
    await comment.toggleLike(userId);

    // Get updated comment data
    const updatedComment = await Comment.findById(id)
      .populate('user', 'name profileImage')
      .lean();
    
    // Send notification if user is liking someone else's comment
    if (comment.user.toString() !== userId) {
      await NotificationService.commentLike(
        userId,
        comment.user.toString(),
        post._id.toString(),
        id
      );
    }
    
    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error('Error toggling comment like:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
/**
 * @desc    Add a reply to a comment
 * @route   POST /api/comments/:id/replies
 * @access  Private
 */
export const addReply = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user?.id;

    if (!text) {
      return res.status(400).json({ message: 'Reply text is required' });
    }

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    await comment.addReply(userId, text);

    const updatedComment = await Comment.findById(id)
      .populate('user', 'name profileImage')
      .populate('replies.user', 'name profileImage')
      .lean();

    return res.status(201).json(updatedComment);
  } catch (error) {
    console.error('Error adding reply:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// src/controllers/comment.controller.ts
// ... (keep all previous code the same, just update the deleteReply function)

/**
 * @desc    Delete a reply
 * @route   DELETE /api/comments/:id/replies/:replyId
 * @access  Private
 */
export const deleteReply = async (req: Request, res: Response) => {
  try {
    const { id, replyId } = req.params;
    const userId = req.user?.id;

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find the reply index using mongoose's ObjectId conversion
    const replyIndex = comment.replies.findIndex(
      (reply) => reply._id.toString() === replyId
    );

    if (replyIndex === -1) {
      return res.status(404).json({ message: 'Reply not found' });
    }

    // Check reply ownership or admin/moderator status
    const reply = comment.replies[replyIndex];
    if (reply.user.toString() !== userId && req.user?.role !== 'admin' && req.user?.role !== 'moderator') {
      return res.status(403).json({ message: 'Not authorized to delete this reply' });
    }

    // Remove the reply
    comment.replies.splice(replyIndex, 1);
    await comment.save();

    const updatedComment = await Comment.findById(id)
      .populate('user', 'name profileImage')
      .populate('replies.user', 'name profileImage')
      .lean();

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error('Error deleting reply:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Toggle like on a reply
 * @route   PUT /api/comments/:id/replies/:replyId/like
 * @access  Private
 */
export const toggleLikeReply = async (req: Request, res: Response) => {
  try {
    const { id, replyId } = req.params;
    const userId = req.user?.id;

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find the reply index
    const replyIndex = comment.replies.findIndex(
      (reply) => reply._id.toString() === replyId
    );

    if (replyIndex === -1) {
      return res.status(404).json({ message: 'Reply not found' });
    }

    // Get the reply
    const reply = comment.replies[replyIndex];

    // Toggle like
    const userIdStr = userId.toString();
    const likeIndex = reply.likes.findIndex(
      (id: mongoose.Types.ObjectId) => id.toString() === userIdStr
    );
    
    if (likeIndex !== -1) {
      // User already liked, so remove the like
      reply.likes.splice(likeIndex, 1);
    } else {
      // User hasn't liked, so add the like
      reply.likes.push(new mongoose.Types.ObjectId(userId));
    }

    await comment.save();

    const updatedComment = await Comment.findById(id)
      .populate('user', 'name profileImage')
      .populate('replies.user', 'name profileImage')
      .lean();

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error('Error toggling reply like:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ... (keep all other functions the same)

/**
 * @desc    Report a comment
 * @route   POST /api/comments/:id/report
 * @access  Private
 */
export const reportComment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id;

    if (!reason) {
      return res.status(400).json({ message: 'Report reason is required' });
    }

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    await comment.report(userId, reason);

    return res.status(200).json({ message: 'Comment reported successfully' });
  } catch (error) {
    console.error('Error reporting comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * @desc    Get reported comments (admin only)
 * @route   GET /api/comments/reported
 * @access  Private (Admin only)
 */
export const getReportedComments = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({ reported: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name profileImage')
      .populate('reportReasons.user', 'name')
      .lean();

    const total = await Comment.countDocuments({ reported: true });

    return res.status(200).json({
      comments,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reported comments:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};