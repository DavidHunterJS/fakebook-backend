// src/controllers/post.controller.ts
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import Post, { PostVisibility, MediaItem } from '../models/Post';
import User from '../models/User';
import Comment from '../models/Comment';
import { Permission } from '../config/roles';
import { NotificationService } from '../services/notification.service';
import { IUser } from '../types/user.types'; // Adjust path
import { S3UploadRequest, FileWithS3 } from '../types/file.types';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';


interface PaginationQuery { page?: string; limit?: string; }

// Types for request parameters and query
interface PostIdParam {
  id: string;
}
interface AuthenticatedRequest extends S3UploadRequest {
  user: {
    id: string;
  };
}
interface CommentIdParam {
  commentId: string;
}

interface UserIdParam {
  userId: string;
}

interface PaginationQuery {
  page?: string;
  limit?: string;
}

// Create interfaces for your route parameters
interface PostIdParam {
  id: string;
}


// src/controllers/post.controller.ts -> createPost function

export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    if (!req.user || !req.user._id) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userId = req.user._id;
    const { text, visibility = PostVisibility.PUBLIC } = req.body;

    const files = req.files as Express.Multer.File[] | undefined;
    const mediaItems: MediaItem[] = files ? files.map(file => {
      const key = ((file as any).key as string) || `posts/${file.filename}`;
      const url = ((file as any).location as string) || `http://localhost:5000/uploads/${key}`;
      let type = 'document';
      if (file.mimetype?.startsWith('image/')) type = 'image';
      else if (file.mimetype?.startsWith('video/')) type = 'video';
      else if (file.mimetype?.startsWith('audio/')) type = 'audio';
      return { url, key, type, originalFilename: file.originalname };
    }) : [];
    
    // ** FINAL CORRECTED LOGIC **
    // This logic ensures that if 'text' is provided, it is always used.
    // A default is only applied if 'text' is missing AND there is media.
    const postData: {
        user: any;
        text: string;
        media: MediaItem[];
        visibility: PostVisibility;
    } = {
        user: userId,
        text: text || '', // Default to empty string if text is null/undefined
        media: mediaItems,
        visibility
    };

    // If the text is empty but we have media, set a default message.
    if (!postData.text && mediaItems.length > 0) {
        postData.text = "Post with media";
    }

    // Final validation check for content
    if (!postData.text.trim() && mediaItems.length === 0) {
      res.status(400).json({ error: 'Post must contain either text or media' });
      return;
    }

    const newPost = new Post(postData);
    const savedPost = await newPost.save();
    await savedPost.populate('user', 'username firstName lastName profilePicture');

    // Handle notifications...
    const mentionedUsernames = (postData.text || '').match(/@(\w+)/g);
    if (mentionedUsernames && mentionedUsernames.length > 0) {
        const uniqueMentionedUsernames = [...new Set(mentionedUsernames.map((m: string) => m.substring(1)))];
        const mentionedUsers = await User.find({ username: { $in: uniqueMentionedUsernames } }).select('_id');
        for (const mentionedUser of mentionedUsers) {
            if (mentionedUser._id.toString() !== userId.toString()) {
                await NotificationService.mention(userId.toString(), mentionedUser._id.toString(), savedPost._id.toString());
            }
        }
    }

    res.status(201).json({
      message: 'Post created successfully',
      post: savedPost
    });
  } catch (error: unknown) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Server error' });
  }
};




/**
 * Get all posts (with pagination)
 * @route GET /api/posts
 */
export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Get posts with populated author
    const posts = await Post.find({ visibility: 'public' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username firstName lastName profilePicture')
      .lean();
    
    // Get total count for pagination
    const total = await Post.countDocuments({ visibility: 'public' });
    
    res.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


/**
 * @route   GET api/posts/feed
 * @desc    Get posts for the user's main feed
 * @access  Private
 */
export const getFeedPosts = async (
  req: Request<{}, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    const userId = req.user.id;

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(userId)
      .select('friends blockedUsers savedPosts')
      .lean();
      
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const usersWhoBlockedMe = await User.find({ blockedUsers: userId }).select('_id').lean();
    const usersWhoBlockedMeIds = usersWhoBlockedMe.map(user => user._id);
    const excludedUserIds = [
      ...(currentUser.blockedUsers || []),
      ...usersWhoBlockedMeIds,
    ];

    // ✅ This is the query from our last attempt.
    let query = {
      $or: [
        { user: new mongoose.Types.ObjectId(userId) },
        {
          user: { $nin: excludedUserIds },
          $or: [
            { visibility: 'public' },
            {
              visibility: 'friends',
              user: { $in: currentUser.friends || [] },
            },
          ],
        },
      ],
    };

    // 🧪 ISOLATION TEST: Uncomment the line below to run a much simpler query.
    // If this test finds posts, the problem is in the complex query structure.
    // If it STILL finds no posts, the problem is your data (e.g., no 'friends' posts exist).
    // query = { visibility: 'friends', user: { $in: currentUser.friends || [] } };


    const posts = await Post.find(query)
      .populate<{ user: IUser }>('user', 'username firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Another useful log to see what the query actually found
    console.log(`Found ${posts.length} posts with the current query.`);

    const total = await Post.countDocuments(query);
    const postsWithEngagement = await Promise.all(
      posts.map(async (post) => {
        const likesCount = post.likes?.length ?? 0;
        const commentsCount = await Comment.countDocuments({ post: post._id });
        const isLiked = (post.likes || []).some(like => like?.toString() === userId);
        const isSaved = (currentUser.savedPosts || []).some(savedId => savedId?.toString() === post._id.toString());
        return { ...post, likesCount, commentsCount, isLiked, isSaved };
      })
    );

    return res.json({
      posts: postsWithEngagement,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error in getFeedPosts:', error.message, error.stack);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/posts/user/:userId
 * @desc    Get posts by user
 * @access  Private
 */
export const getUserPosts = async (
  req: Request<UserIdParam, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { userId } = req.params;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is blocked or has blocked current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === userId);
    const hasBlocked = targetUser.blockedUsers.some(id => id.toString() === req.user!.id);

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot view posts from this user' });
    }

    // Determine which posts are visible based on relationship
    let visibilityFilter: any = { visibility: 'public' };

    // If viewing own posts, show all
    if (userId === req.user.id) {
      visibilityFilter = {};
    } 
    // If viewing friend's posts, show public and friends-only
    else if (currentUser.friends.some(id => id.toString() === userId)) {
      visibilityFilter = { visibility: { $in: ['public', 'friends'] } };
    }
    // Otherwise, only public posts are visible

    const posts = await Post.find({ 
      user: userId,
      ...visibilityFilter 
    })
      .populate('user', 'username firstName lastName profilePicture')
      .sort({ pinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({ 
      user: userId,
      ...visibilityFilter 
    });

    // Add engagement data
    const postsWithEngagement = await Promise.all(
      posts.map(async (post) => {
        const likesCount = post.likes.length;
        const commentsCount = await Comment.countDocuments({ post: post._id });
        const isLiked = post.likes.some(like => 
          like instanceof mongoose.Types.ObjectId 
            ? like.toString() === req.user!.id 
            : like === req.user!.id
        );
        const isSaved = currentUser.savedPosts?.includes(post._id as any) || false;

        const postObject = post.toObject();
        return {
          ...postObject,
          likesCount,
          commentsCount,
          isLiked,
          isSaved
        };
      })
    );

    return res.json({
      posts: postsWithEngagement,
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
 * @route   GET api/posts/:id
 * @desc    Get post by ID
 * @access  Private
 */
export const getPostById = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    // 1. Assert custom request type to safely access 'user'
    const user = (req as unknown as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // 2. Fetch data in parallel, now with .lean() on the post query
    const [post, currentUser] = await Promise.all([
      Post.findById(req.params.id)
          .populate<{ user: IUser }>('user', 'username firstName lastName profilePicture blockedUsers friends')
          .lean(), // <-- Added .lean() for performance
      User.findById(user.id).select('friends savedPosts blockedUsers').lean()
    ]);

    if (!post || !currentUser) {
      return res.status(404).json({ message: 'Post or user not found' });
    }

    const postOwner = post.user;
    const isOwner = postOwner._id.toString() === currentUser._id.toString();

    // 3. Permission checks (your existing logic is great and remains unchanged)
    const isBlocked = postOwner.blockedUsers?.some(id => id.toString() === currentUser._id.toString()) ||
                      currentUser.blockedUsers?.some(id => id.toString() === postOwner._id.toString());
    
    if (!isOwner && isBlocked) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.visibility !== 'public' && !isOwner) {
        if (post.visibility === 'private' || (post.visibility === 'friends' && !postOwner.friends?.some(id => id.toString() === currentUser._id.toString()))) {
            return res.status(404).json({ message: 'Post not found' });
        }
    }
    
    // 4. Get engagement data
    const commentsCount = await Comment.countDocuments({ post: post._id });
    const isLiked = post.likes.some(id => id.toString() === currentUser._id.toString());
    const isSaved = currentUser.savedPosts?.some(id => id.toString() === post._id.toString()) || false;

    // 5. Combine and send (no .toObject() needed because of .lean())
    const postWithEngagement = {
      ...post,
      likesCount: post.likes.length,
      commentsCount,
      isLiked,
      isSaved,
    };

    return res.json(postWithEngagement);
  } catch (err) {
    console.error((err as Error).message);
    if ((err as any).kind === 'ObjectId') {
        return res.status(404).json({ message: 'Post not found' });
    }
    return res.status(500).send('Server error');
  }
};

interface AuthenticatedPostRequest extends Request<PostIdParam> {
  user: IUser; // or whatever your user type is
}
/**
 * @route   PUT api/posts/:id
 * @desc    Update a post
 * @access  Private
 */
export const updatePost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    console.log("--- 📥 UPDATE POST CONTROLLER REACHED ---");
    
    // Debug: Log what we received
    console.log("req.files:", req.files);
    console.log("req.s3Keys:", (req as any).s3Keys);
    console.log("req.s3Urls:", (req as any).s3Urls);
    console.log("req.body:", req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = (req as unknown as AuthenticatedRequest).user;
    const files = req.files as Express.Multer.File[]; // Standard multer files
    const s3Keys = (req as any).s3Keys as string[]; // Your S3 keys
    const s3Urls = (req as any).s3Urls as string[]; // Your S3 URLs

    if (!user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { text, visibility, shouldRemoveImage } = req.body;
    console.log(`Fetching post with ID: ${req.params.id}`);
    
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Authorization check...
    if (post.user.toString() !== user.id) {
      console.log("User is not the owner. Checking admin permissions...");
      const currentUser = await User.findById(user.id);
      if (!currentUser || !currentUser.permissions?.includes(Permission.EDIT_ANY_POST)) {
        return res.status(403).json({ message: 'Not authorized to edit this post' });
      }
    }

    // Update text and visibility
    if (text !== undefined) post.text = text;
    if (visibility) post.visibility = visibility as PostVisibility;

    // Case 1: New files were uploaded
    if (files && files.length > 0 && s3Keys && s3Urls) {
      console.log(`CASE 1 reached. New files detected. Processing upload...`);
      
      // If there are old images, delete them all from S3 first
      if (post.media && post.media.length > 0) {
        console.log(`Deleting ${post.media.length} old media file(s).`);
        for (const oldMedia of post.media) {
          if (oldMedia.key) await s3UploadMiddleware.deleteFile(oldMedia.key);
        }
      }

      // Create new media array using S3 data
      post.media = files.map((file, index) => ({
        url: s3Urls[index],
        key: s3Keys[index],
        type: file.mimetype.startsWith('image') ? 'image' : 'video',
      }));

      console.log("New media array created:", post.media);
    }
    // Case 2: The "Remove Image" checkbox is checked (and no new files were uploaded)
    else if (JSON.parse(shouldRemoveImage || 'false') === true) {
      console.log("'Remove Image' flag is true. Deleting existing media...");
      if (post.media && post.media.length > 0) {
        for (const oldMedia of post.media) {
          if (oldMedia.key) await s3UploadMiddleware.deleteFile(oldMedia.key);
        }
        post.media = [];
        console.log("Old media deleted and array cleared.");
      }
    }

    console.log("💾 Saving updated post to database...");
    await post.save();
    console.log("Database save successful. Populating user data...");
    
    const updatedPost = await post.populate([
      { path: 'user', select: 'username firstName lastName profilePicture' },
      { path: 'tags', select: 'username firstName lastName profilePicture' }
    ]);

    console.log("✅ Update process complete. Sending response.");
    return res.json(updatedPost);
  } catch (err) {
    console.error("--- 💥 UPDATE POST CONTROLLER CRASHED ---", err);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/:id
 * @desc    Delete a post
 * @access  Private
 */

export const deletePost = async (req: Request, res: Response): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const postId = req.params.id;
    
    // Find the post
    const post = await Post.findById(postId);
    
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    
    // Check if user is the author or has admin permissions
    if (post.user.toString() !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'You do not have permission to delete this post' });
      return;
    }
    
    // Delete associated media files
    if (post.media && post.media.length > 0) {
      for (const mediaItem of post.media) {
        if (mediaItem.key) {
          try {
            if (process.env.S3_BUCKET_NAME) {
              // Delete from S3
              await s3UploadMiddleware.deleteFile(mediaItem.key);
            } else {
              // Delete from local storage
              const filePath = path.join(__dirname, '../../uploads/', mediaItem.key);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            }
          } catch (fileError: unknown) {
            console.error(`Failed to delete file ${mediaItem.key}:`, fileError);
          }
        }
      }
    }
    
    // Delete the post
    await Post.findByIdAndDelete(postId);
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// src/controllers/post.controller.ts -> likePost function

/**
 * @route   POST api/posts/:id/like
 * @desc    Like or unlike a post (toggle)
 * @access  Private
 */
export const likePost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const postId = req.params.id;
    const likerId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // --- Visibility and permission checks (no changes needed here) ---
    const postOwner = await User.findById(post.user);
    if (!postOwner) return res.status(404).json({ message: 'Post owner not found' });
    const currentUser = await User.findById(likerId);
    if (!currentUser) return res.status(404).json({ message: 'Current user not found' });
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner._id.toString());
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === likerId.toString());
    if (isBlocked || hasBlocked) return res.status(403).json({ message: 'Cannot interact with this post' });
    const isOwner = post.user.toString() === likerId.toString();
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner._id.toString());
    if (!isOwner && post.visibility === 'private') return res.status(403).json({ message: 'This post is private' });
    if (!isOwner && post.visibility === 'friends' && !isFriend) return res.status(403).json({ message: 'This post is only visible to friends' });
    // --- End of visibility checks ---

    // ** CORRECTED TOGGLE LOGIC **
    const likeIndex = post.likes.findIndex(like => like.toString() === likerId.toString());

    if (likeIndex > -1) {
      // User has already liked the post, so UNLIKE it.
      post.likes.splice(likeIndex, 1);
      await post.save();
      // No notification is sent for an unlike action.
      return res.json({ message: 'Post unliked', likes: post.likes.length });

    } else {
      // User has not liked the post, so LIKE it.
      post.likes.push(likerId);
      await post.save();
      
      // Send notification ONLY when a new like is added
      if (post.user.toString() !== likerId.toString()) {
        await NotificationService.postLike(
          likerId.toString(),
          post.user.toString(),
          postId.toString()
        );
      }
      return res.json({ message: 'Post liked', likes: post.likes.length });
    }
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/:id/like
 * @desc    Unlike a post
 * @access  Private
 */
export const unlikePost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if post is liked
    if (!post.likes.some(like => like.toString() === req.user!.id)) {
      return res.status(400).json({ message: 'Post not liked yet' });
    }

    // Remove like
    post.likes = post.likes.filter(
      like => like.toString() !== req.user!.id
    );
    await post.save();

    return res.json({ message: 'Post unliked', likes: post.likes.length });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/posts/:id/likes
 * @desc    Get users who liked a post
 * @access  Private
 */
export const getPostLikes = async (
  req: Request<PostIdParam, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user can see this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner.id);
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === req.user!.id);

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot view this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === req.user.id;
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner.id.toString());

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

    // Get users who liked the post, excluding blocked users
    const likeUserIds = post.likes.map(like => 
      like instanceof mongoose.Types.ObjectId ? like : new mongoose.Types.ObjectId(like.toString())
    );
    
    const blockedUserIds = [
      ...currentUser.blockedUsers.map(id => 
        id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id.toString())
      ),
      ...(await User.find({ blockedUsers: req.user.id }).select('_id')).map(user => user._id)
    ];

    const users = await User.find({
      _id: { $in: likeUserIds, $nin: blockedUserIds }
    })
      .select('username firstName lastName profilePicture')
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments({
      _id: { $in: likeUserIds, $nin: blockedUserIds }
    });

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
 * @route   POST api/posts/:id/comment
 * @desc    Add a comment to a post
 * @access  Private
 */
export const addComment = async (
  req: Request<PostIdParam, {}, { text: string }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user || !req.user._id) { // Use _id for consistency
      return res.status(401).json({ message: 'Not authorized' });
    }

    const commenterId = req.user._id; // The ID of the user commenting
    const { text } = req.body;

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user can see this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user (commenter)
    const currentUser = await User.findById(commenterId); // Use commenterId here
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner._id.toString()); // Use _id
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === commenterId.toString()); // Use _id

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot interact with this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === commenterId.toString(); // Use _id
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner._id.toString()); // Use _id

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

    // Create new comment
    const newComment = new Comment({
      user: commenterId, // Use commenterId here
      post: post._id,
      text
    });

    const savedComment = await newComment.save();

    // Populate user data for response
    const populatedComment = await Comment.findById(savedComment._id)
      .populate('user', 'username firstName lastName profilePicture');

    // ==========================================================
    // NOTIFICATION INTEGRATION START
    // ==========================================================

    // 1. Notify the Post Author that someone commented on their post
    // Only send if the commenter is not the post author
    if (commenterId.toString() !== post.user.toString()) {
      await NotificationService.postComment(
        commenterId.toString(),        // The user who commented
        post.user.toString(),         // The author of the post
        post._id.toString(),          // The ID of the post
        savedComment._id.toString()   // The ID of the new comment
      );
    }

    // 2. Detect and notify mentioned users in the comment text
    const mentionedUsernames = text.match(/@(\w+)/g); // Finds all @username patterns

    if (mentionedUsernames && mentionedUsernames.length > 0) {
      // Extract unique usernames and remove the '@' prefix
      const uniqueMentionedUsernames = [...new Set(mentionedUsernames.map((m: string) => m.substring(1)))];

      // Find the IDs of the mentioned users
      const mentionedUsers = await User.find({
        username: { $in: uniqueMentionedUsernames }
      }).select('_id');

      // Send a notification for each mentioned user
      for (const mentionedUser of mentionedUsers) {
        // Ensure the commenter is not notifying themselves
        // And also ensure the mentioned user is not the post author
        // (as they already get a POST_COMMENT notification)
        if (
          mentionedUser._id.toString() !== commenterId.toString() &&
          mentionedUser._id.toString() !== post.user.toString() // Avoid double notification if post author is mentioned
        ) {
          await NotificationService.mention(
            commenterId.toString(),         // The user who made the comment (mentioner)
            mentionedUser._id.toString(),  // The user who was mentioned
            post._id.toString()            // The ID of the post
          );
        }
      }
    }

    // ==========================================================
    // NOTIFICATION INTEGRATION END
    // ==========================================================

    return res.status(201).json(populatedComment);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};
/**
 * @route   GET api/posts/:id/comments
 * @desc    Get comments for a post
 * @access  Private
 */
export const getPostComments = async (
  req: Request<PostIdParam, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user can see this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner.id);
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === req.user!.id);

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot view this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === req.user.id;
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner.id.toString());

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

// Get blocked users to filter out comments
let blockedUserIds: mongoose.Types.ObjectId[] = [];

// Add user's own blocked users
if (currentUser.blockedUsers && currentUser.blockedUsers.length > 0) {
  const validBlockedIds = currentUser.blockedUsers.map(id => {
    try {
      return new mongoose.Types.ObjectId(id.toString());
    } catch (error) {
      console.warn(`Invalid ID format in blockedUsers: ${id}`);
      return null;
    }
  }).filter((id): id is mongoose.Types.ObjectId => id !== null);
  
  blockedUserIds = [...validBlockedIds];
}

// Add users who have blocked the current user
try {
  const usersWhoBlockedMe = await User.find({ 
    blockedUsers: req.user.id 
  }).select('_id');
  
  blockedUserIds = [
    ...blockedUserIds,
    ...usersWhoBlockedMe.map(user => user._id)
  ];
} catch (error) {
  console.error("Error finding users who blocked the current user:", error);
}

    // Get comments for the post
    const comments = await Comment.find({
      post: post._id,
      user: { $nin: blockedUserIds }
    })
      .populate('user', 'username firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments({
      post: post._id,
      user: { $nin: blockedUserIds }
    });

    // Add additional data for each comment
    const commentsWithData = comments.map(comment => {
      const isLiked = comment.likes.some(like => 
        like instanceof mongoose.Types.ObjectId 
          ? like.toString() === req.user!.id 
          : like === req.user!.id
      );
      
      const commentObj = comment.toObject();
      return {
        ...commentObj,
        likesCount: comment.likes.length,
        repliesCount: comment.replies.length,
        isLiked
      };
    });

    return res.json({
      comments: commentsWithData,
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
 * @route   PUT api/posts/comment/:commentId
 * @desc    Update a comment
 * @access  Private
 */
export const updateComment = async (
  req: Request<CommentIdParam, {}, { text: string }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { text } = req.body;

    // Find comment
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user is authorized to update comment
    if (comment.user.toString() !== req.user.id) {
      // Check if the user has the permission to edit any comment
      const currentUser = await User.findById(req.user.id);
      if (!currentUser || !currentUser.permissions?.includes(Permission.EDIT_ANY_POST)) {
        return res.status(403).json({ message: 'Not authorized to edit this comment' });
      }
    }

    // Update comment
    comment.text = text;
    await comment.save();

    // Return updated comment
    const updatedComment = await Comment.findById(comment._id)
      .populate('user', 'username firstName lastName profilePicture');

    return res.json(updatedComment);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/comment/:commentId
 * @desc    Delete a comment
 * @access  Private
 */
export const deleteComment = async (
  req: Request<CommentIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find comment
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find associated post
    const post = await Post.findById(comment.post);
    if (!post) {
      return res.status(404).json({ message: 'Associated post not found' });
    }

    // Check if user is authorized to delete comment
    const isCommentOwner = comment.user.toString() === req.user.id;
    const isPostOwner = post.user.toString() === req.user.id;
    const isModerator = await User.exists({
      _id: req.user.id,
      permissions: { $in: [Permission.DELETE_ANY_POST] }
    });

    if (!isCommentOwner && !isPostOwner && !isModerator) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    // Delete comment
    await comment.deleteOne();

    return res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};


/**
 * @route   POST api/posts/comment/:commentId/like
 * @desc    Like a comment
 * @access  Private
 */
export const likeComment = async (
  req: Request<CommentIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user || !req.user._id) { // Use _id for consistency
      return res.status(401).json({ message: 'Not authorized' });
    }

    const likerId = req.user._id; // The ID of the user liking the comment

    // Find comment
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if comment is already liked by the current user
    if (comment.likes.some(like => like.toString() === likerId.toString())) { // Use likerId for comparison
      return res.status(400).json({ message: 'Comment already liked' });
    }

    // Find post to check visibility
    const post = await Post.findById(comment.post);
    if (!post) {
      return res.status(404).json({ message: 'Associated post not found' });
    }

    // Check if user can interact with this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user
    const currentUser = await User.findById(likerId); // Use likerId
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner._id.toString()); // Use _id
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === likerId.toString()); // Use likerId

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot interact with this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === likerId.toString(); // Use likerId
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner._id.toString()); // Use _id

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

    // Add like
    comment.likes.push(likerId); // Use likerId
    await comment.save();

    // ==========================================================
    // NOTIFICATION INTEGRATION START
    // ==========================================================

    // Send a COMMENT_LIKE notification to the original comment author
    // Only send if the liker is not the comment author
    if (likerId.toString() !== comment.user.toString()) {
        await NotificationService.commentLike(
            likerId.toString(),         // The user who liked the comment
            comment.user.toString(),    // The author of the original comment
            post._id.toString(),        // The ID of the post the comment belongs to
            comment._id.toString()      // The ID of the comment that was liked
        );
    }

    // ==========================================================
    // NOTIFICATION INTEGRATION END
    // ==========================================================

    return res.json({ message: 'Comment liked', likes: comment.likes.length });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/comment/:commentId/like
 * @desc    Unlike a comment
 * @access  Private
 */
export const unlikeComment = async (
  req: Request<CommentIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find comment
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if comment is liked
    if (!comment.likes.some(like => like.toString() === req.user!.id)) {
      return res.status(400).json({ message: 'Comment not liked yet' });
    }

    // Remove like
    comment.likes = comment.likes.filter(
      like => like.toString() !== req.user!.id
    );
    await comment.save();

    return res.json({ message: 'Comment unliked', likes: comment.likes.length });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/posts/:id/share
 * @desc    Share a post
 * @access  Private
 */
export const sharePost = async (
  req: Request<PostIdParam, {}, { text?: string, visibility?: PostVisibility }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { text, visibility = 'public' } = req.body;

    // Find original post
    const originalPost = await Post.findById(req.params.id)
      .populate('user', 'username firstName lastName profilePicture');
    
    if (!originalPost) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user can see this post (same visibility rules as viewing)
    const postOwner = await User.findById(originalPost.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner.id);
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === req.user!.id);

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot share this post' });
    }

    // Check original post visibility
    const isOwner = originalPost.user._id.toString() === req.user.id;
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner.id.toString());

    if (!isOwner && originalPost.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private and cannot be shared' });
    }

    if (!isOwner && originalPost.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends and cannot be shared' });
    }

    // Create new post (the share)
    const newPost = new Post({
      user: req.user.id,
      text: text || '',
      visibility,
      originalPost: originalPost._id,
      sharedFrom: originalPost.user._id
    });

    await newPost.save();

    // Add share to original post
    originalPost.shares.push({
      user: req.user.id,
      date: new Date()
    });
    await originalPost.save();

    // Populate user data for response
    const populatedPost = await Post.findById(newPost._id)
      .populate('user', 'username firstName lastName profilePicture')
      .populate('originalPost')
      .populate('sharedFrom', 'username firstName lastName profilePicture');

    return res.status(201).json(populatedPost);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/posts/:id/report
 * @desc    Report a post
 * @access  Private
 */
export const reportPost = async (
  req: Request<PostIdParam, {}, { reason: string }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { reason } = req.body;

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user already reported
    if (post.reportReasons.some(report => report.user.toString() === req.user!.id)) {
      return res.status(400).json({ message: 'You have already reported this post' });
    }

    // Add report
    post.reportReasons.push({
      user: req.user.id,
      reason,
      date: new Date()
    });

    // Mark as reported
    post.reported = true;

    await post.save();

    return res.json({ message: 'Post reported successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/posts/comment/:commentId/report
 * @desc    Report a comment
 * @access  Private
 */
export const reportComment = async (
  req: Request<CommentIdParam, {}, { reason: string }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { reason } = req.body;

    // Find comment
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user already reported
    if (comment.reportReasons?.some(report => report.user.toString() === req.user!.id)) {
      return res.status(400).json({ message: 'You have already reported this comment' });
    }

    // Initialize reportReasons if it doesn't exist
    if (!comment.reportReasons) {
      comment.reportReasons = [];
    }

    // Add report
    comment.reportReasons.push({
      user: req.user.id,
      reason,
      date: new Date()
    });

    // Mark as reported
    comment.reported = true;

    await comment.save();

    return res.json({ message: 'Comment reported successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/posts/saved
 * @desc    Get saved posts
 * @access  Private
 */
export const getSavedPosts = async (
  req: Request<{}, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    // Get current user with savedPosts
    const currentUser = await User.findById(req.user.id).select('savedPosts blockedUsers');
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!currentUser.savedPosts || currentUser.savedPosts.length === 0) {
      return res.json({
        posts: [],
        pagination: {
          total: 0,
          page,
          pages: 0
        }
      });
    }

    // Get blocked users
    const blockedUserIds = currentUser.blockedUsers.map(id => 
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id.toString())
    );
    const usersWhoBlockedMe = await User.find({ blockedUsers: req.user.id }).select('_id');
    const excludedUsers = [
      ...blockedUserIds,
      ...usersWhoBlockedMe.map(user => user._id)
    ];

    // Get saved posts
    const savedPostIds = currentUser.savedPosts.map(id => 
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)
    );

    const posts = await Post.find({
      _id: { $in: savedPostIds },
      user: { $nin: excludedUsers }
    })
      .populate('user', 'username firstName lastName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({
      _id: { $in: savedPostIds },
      user: { $nin: excludedUsers }
    });

    // Add engagement data
    const postsWithEngagement = await Promise.all(
      posts.map(async (post) => {
        const likesCount = post.likes.length;
        const commentsCount = await Comment.countDocuments({ post: post._id });
        const isLiked = post.likes.some(like => 
          like instanceof mongoose.Types.ObjectId 
            ? like.toString() === req.user!.id 
            : like === req.user!.id
        );

        const postObject = post.toObject();
        return {
          ...postObject,
          likesCount,
          commentsCount,
          isLiked,
          isSaved: true
        };
      })
    );

    return res.json({
      posts: postsWithEngagement,
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
 * @route   POST api/posts/:id/save
 * @desc    Save a post
 * @access  Private
 */
export const savePost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user can see this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner.id);
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === req.user!.id);

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot interact with this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === req.user.id;
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner.id.toString());

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

    // Initialize savedPosts if it doesn't exist
    if (!currentUser.savedPosts) {
      currentUser.savedPosts = [];
    }

    // Check if already saved
    if (currentUser.savedPosts.some(id => id.toString() === post.id)) {
      return res.status(400).json({ message: 'Post already saved' });
    }

    // Save post
    currentUser.savedPosts.push(post._id);
    await currentUser.save();

    return res.json({ message: 'Post saved successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/:id/save
 * @desc    Unsave a post
 * @access  Private
 */
export const unsavePost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Get current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if post is saved
    if (!currentUser.savedPosts || !currentUser.savedPosts.some(id => id.toString() === req.params.id)) {
      return res.status(400).json({ message: 'Post not saved' });
    }

    // Remove post from saved posts
    currentUser.savedPosts = currentUser.savedPosts.filter(
      id => id.toString() !== req.params.id
    );
    await currentUser.save();

    return res.json({ message: 'Post removed from saved' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/posts/trending
 * @desc    Get trending posts
 * @access  Private
 */
export const getTrendingPosts = async (
  req: Request<{}, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    // Get current user to check blocked users
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get blocked users to exclude from results
    const blockedUserIds = currentUser.blockedUsers.map(id => 
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id.toString())
    );
    const usersWhoBlockedMe = await User.find({ blockedUsers: req.user.id }).select('_id');
    const excludedUsers = [
      ...blockedUserIds,
      ...usersWhoBlockedMe.map(user => user._id)
    ];

    // Calculate trending score based on recent engagement
    // Trending = (likes + comments * 2 + shares * 3) / (hours since post + 2)^1.5
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

    // Only include public posts from the last 3 days
    const recentPosts = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: threeDaysAgo },
          visibility: 'public',
          user: { $nin: excludedUsers }
        }
      },
      {
        $addFields: {
          likesCount: { $size: '$likes' },
          sharesCount: { $size: '$shares' },
          hoursSincePost: {
            $divide: [
              { $subtract: [now, '$createdAt'] },
              3600000 // milliseconds in an hour
            ]
          }
        }
      },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'post',
          as: 'comments'
        }
      },
      {
        $addFields: {
          commentsCount: { $size: '$comments' },
          // Trending score formula
          trendingScore: {
            $divide: [
              {
                $add: [
                  { $size: '$likes' },
                  { $multiply: [{ $size: '$comments' }, 2] },
                  { $multiply: [{ $size: '$shares' }, 3] }
                ]
              },
              {
                $pow: [
                  {
                    $add: [
                      {
                        $divide: [
                          { $subtract: [now, '$createdAt'] },
                          3600000 // milliseconds in an hour
                        ]
                      },
                      2 // Prevent division by very small numbers
                    ]
                  },
                  1.5 // Power to decrease score faster as time passes
                ]
              }
            ]
          }
        }
      },
      {
        $sort: { trendingScore: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
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
          _id: 1,
          text: 1,
          media: 1,
          visibility: 1,
          createdAt: 1,
          updatedAt: 1,
          likesCount: 1,
          commentsCount: 1,
          sharesCount: 1,
          trendingScore: 1,
          user: {
            _id: '$userInfo._id',
            username: '$userInfo.username',
            firstName: '$userInfo.firstName',
            lastName: '$userInfo.lastName',
            profilePicture: '$userInfo.profilePicture'
          },
          // Check if current user liked the post
          isLiked: {
            $in: [
              new mongoose.Types.ObjectId(req.user.id),
              '$likes'
            ]
          },
          // Check if current user saved the post
          isSaved: {
            $in: [
              '$_id',
              {
                $ifNull: [
                  { $map: { input: currentUser.savedPosts, as: 'sp', in: '$$sp' } },
                  []
                ]
              }
            ]
          }
        }
      }
    ]);

    // Count total trending posts
    const total = await Post.countDocuments({
      createdAt: { $gte: threeDaysAgo },
      visibility: 'public',
      user: { $nin: excludedUsers }
    });

    return res.json({
      posts: recentPosts,
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
 * @route   POST api/posts/comment/:commentId/reply
 * @desc    Reply to a comment
 * @access  Private
 */
export const replyToComment = async (
  req: Request<CommentIdParam, {}, { text: string }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user || !req.user._id) { // Use _id for consistency
      return res.status(401).json({ message: 'Not authorized' });
    }

    const replierId = req.user._id; // The ID of the user replying
    const { text } = req.body;

    // Find comment
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find post to check visibility
    const post = await Post.findById(comment.post);
    if (!post) {
      return res.status(404).json({ message: 'Associated post not found' });
    }

    // Check if user can interact with this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user (replier)
    const currentUser = await User.findById(replierId); // Use replierId here
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner._id.toString()); // Use _id
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === replierId.toString()); // Use _id

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot interact with this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === replierId.toString(); // Use _id
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner._id.toString()); // Use _id

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

    // Add reply to comment
    // Ensure the user field of the new reply is correctly typed as ObjectId
    const newReply = {
      _id: new mongoose.Types.ObjectId(), // Generate a new ObjectId for the reply
      user: replierId, // Use replierId here
      text,
      likes: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    comment.replies.push(newReply as any); // Cast to any to bypass strict type checking if needed for now
    await comment.save();

    // Get the added reply with populated user info
    // Fetch the entire comment again to ensure proper population of the new reply
    const updatedComment = await Comment.findById(comment._id)
      .populate('user', 'username firstName lastName profilePicture')
      .populate('replies.user', 'username firstName lastName profilePicture');

    const addedReply = updatedComment?.replies.find(
      (reply: any) => reply._id.toString() === newReply._id.toString()
    ); // Find the newly added reply

    if (!addedReply) {
      // This should ideally not happen if save and findById worked
      console.error('Error: Could not find the newly added reply after save and populate.');
      return res.status(500).send('Server error: Reply not found after creation.');
    }

    // ==========================================================
    // NOTIFICATION INTEGRATION START
    // ==========================================================

    // 1. Notify the original Comment Author that someone replied to their comment
    // Only send if the replier is not the original comment author
    if (replierId.toString() !== comment.user.toString()) {
      await NotificationService.commentReply(
        replierId.toString(),         // The user who replied
        comment.user.toString(),      // The author of the original comment
        post._id.toString(),          // The ID of the post the comment belongs to
        comment._id.toString(),       // The ID of the original comment
        addedReply._id.toString()     // The ID of the new reply
      );
    }

    // 2. Detect and notify mentioned users in the reply text
    const mentionedUsernames = text.match(/@(\w+)/g); // Finds all @username patterns

    if (mentionedUsernames && mentionedUsernames.length > 0) {
      // Extract unique usernames and remove the '@' prefix
      const uniqueMentionedUsernames = [...new Set(mentionedUsernames.map((m: string) => m.substring(1)))];

      // Find the IDs of the mentioned users
      const mentionedUsers = await User.find({
        username: { $in: uniqueMentionedUsernames }
      }).select('_id');

      // Send a notification for each mentioned user
      for (const mentionedUser of mentionedUsers) {
        // Ensure the replier is not notifying themselves
        // And also ensure the mentioned user is not the original comment author
        // (as they might already get a COMMENT_REPLY notification)
        if (
          mentionedUser._id.toString() !== replierId.toString() &&
          mentionedUser._id.toString() !== comment.user.toString() // Avoid double notification if comment author is mentioned
        ) {
          await NotificationService.mention(
            replierId.toString(),         // The user who made the reply (mentioner)
            mentionedUser._id.toString(), // The user who was mentioned
            post._id.toString()           // The ID of the post
          );
        }
      }
    }

    // ==========================================================
    // NOTIFICATION INTEGRATION END
    // ==========================================================

    return res.status(201).json(addedReply);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};
/**
 * @route   GET api/posts/comment/:commentId/replies
 * @desc    Get replies to a comment
 * @access  Private
 */
export const getCommentReplies = async (
  req: Request<CommentIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find comment
    const comment = await Comment.findById(req.params.commentId)
      .populate('replies.user', 'username firstName lastName profilePicture');
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find post to check visibility
    const post = await Post.findById(comment.post);
    if (!post) {
      return res.status(404).json({ message: 'Associated post not found' });
    }

    // Check if user can see this post (same visibility rules as viewing)
    const postOwner = await User.findById(post.user);
    if (!postOwner) {
      return res.status(404).json({ message: 'Post owner not found' });
    }

    // Get current user
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Check if either user has blocked the other
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === postOwner.id);
    const hasBlocked = postOwner.blockedUsers.some(id => id.toString() === req.user!.id);

    if (isBlocked || hasBlocked) {
      return res.status(403).json({ message: 'Cannot view this post' });
    }

    // Check post visibility
    const isOwner = post.user.toString() === req.user.id;
    const isFriend = currentUser.friends.some(id => id.toString() === postOwner.id.toString());

    if (!isOwner && post.visibility === 'private') {
      return res.status(403).json({ message: 'This post is private' });
    }

    if (!isOwner && post.visibility === 'friends' && !isFriend) {
      return res.status(403).json({ message: 'This post is only visible to friends' });
    }

    // Add additional data for each reply
    const repliesWithData = comment.replies.map(reply => {
      const isLiked = reply.likes.some(like => 
        like instanceof mongoose.Types.ObjectId 
          ? like.toString() === req.user!.id 
          : like === req.user!.id
      );
      
      const replyObj = reply.toObject();
      return {
        ...replyObj,
        likesCount: reply.likes.length,
        isLiked
      };
    });

    return res.json(repliesWithData);
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/posts/admin/reported
 * @desc    Get reported posts (admin only)
 * @access  Private/Admin
 */
export const getReportedPosts = async (
  req: Request<{}, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;

    // Check if user has permission to access reported posts
    const currentUser = await User.findById(req.user.id);
    if (!currentUser || !currentUser.permissions?.includes(Permission.EDIT_ANY_POST)) {
      return res.status(403).json({ message: 'Not authorized to view reported posts' });
    }

    // Get reported posts
    const reportedPosts = await Post.find({ reported: true })
      .populate('user', 'username firstName lastName profilePicture email')
      .populate('reportReasons.user', 'username firstName lastName')
      .sort({ 'reportReasons.length': -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments({ reported: true });

    return res.json({
      posts: reportedPosts,
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
 * @route   POST api/posts/:id/pin
 * @desc    Pin post to profile
 * @access  Private
 */
export const pinPost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Can only pin your own posts' });
    }

    // Unpin any currently pinned posts
    await Post.updateMany(
      { user: req.user.id, pinned: true },
      { $set: { pinned: false } }
    );

    // Pin the selected post
    post.pinned = true;
    await post.save();

    return res.json({ message: 'Post pinned to profile' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/:id/pin
 * @desc    Unpin post from profile
 * @access  Private
 */
export const unpinPost = async (
  req: Request<PostIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Can only unpin your own posts' });
    }

    // Check if post is pinned
    if (!post.pinned) {
      return res.status(400).json({ message: 'Post is not pinned' });
    }

    // Unpin the post
    post.pinned = false;
    await post.save();

    return res.json({ message: 'Post unpinned from profile' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

interface PostIdParam {
  id: string;
}

/**
 * @route   POST api/posts/:id/tag
 * @desc    Tag users in a post
 * @access  Private
 */
export const tagUsers = async (
  req: Request<PostIdParam, {}, { userIds: string[] }>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user || !req.user._id) { // Use _id for consistency
      return res.status(401).json({ message: 'Not authorized' });
    }

    const taggerId = req.user._id; // The ID of the user doing the tagging
    const { userIds } = req.body;

    // Find post
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post
    if (post.user.toString() !== taggerId.toString()) { // Use _id for comparison
      return res.status(403).json({ message: 'Can only tag users in your own posts' });
    }

    // Check if users exist and are not blocked
    const currentUser = await User.findById(taggerId); // Use taggerId
    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    // Get blocked users
    const blockedUserIds = currentUser.blockedUsers.map(id => id.toString());
    const usersWhoBlockedMe = await User.find({ blockedUsers: taggerId }).select('_id'); // Use taggerId
    const excludedUserIds = [
      ...blockedUserIds,
      ...usersWhoBlockedMe.map(user => user._id.toString())
    ];

    const newTaggedUserIds: string[] = []; // To store IDs of users who are actually newly tagged

    // Filter out invalid user IDs
    const validUserIdsToAdd: mongoose.Types.ObjectId[] = [];
    for (const userId of userIds) {
      // Skip if user is already tagged
      if (post.tags.some(tag => tag.toString() === userId)) {
        continue;
      }

      // Skip if user is blocked or has blocked current user
      if (excludedUserIds.includes(userId)) {
        continue;
      }

      // Skip if tagging self (post owner)
      if (userId.toString() === taggerId.toString()) {
          continue;
      }

      // Check if user exists
      const userExists = await User.exists({ _id: userId });
      if (userExists) {
        validUserIdsToAdd.push(new mongoose.Types.ObjectId(userId));
        newTaggedUserIds.push(userId); // Add to our list for notifications
      }
    }

    // Add valid users to tags
    post.tags.push(...validUserIdsToAdd);
    await post.save();

    // Get updated post with tags
    const updatedPost = await Post.findById(post._id)
      .populate('tags', 'username firstName lastName profilePicture');

    // ==========================================================
    // NOTIFICATION INTEGRATION START
    // ==========================================================

    // Send a MENTION notification for each newly tagged user
    for (const taggedUserId of newTaggedUserIds) {
        // The NotificationService.mention already has a check for self-mention,
        // but we've also added it in the filtering above for clarity and efficiency.
        await NotificationService.mention(
            taggerId.toString(),        // The user who did the tagging
            taggedUserId,               // The user who was tagged
            post._id.toString()         // The ID of the post
        );
    }

    // ==========================================================
    // NOTIFICATION INTEGRATION END
    // ==========================================================

    return res.json({
      message: 'Users tagged in post',
      tags: updatedPost?.tags
    });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   DELETE api/posts/:id/tag/:userId
 * @desc    Remove user tag from post
 * @access  Private
 */
export const removeUserTag = async (
  req: Request<PostIdParam & UserIdParam>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { id: postId, userId } = req.params;

    // Find post
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user owns the post or is the tagged user
    const isPostOwner = post.user.toString() === req.user.id;
    const isTaggedUser = userId === req.user.id;

    if (!isPostOwner && !isTaggedUser) {
      return res.status(403).json({ message: 'Not authorized to remove this tag' });
    }

    // Remove tag if it exists
    if (!post.tags.some(tag => tag.toString() === userId)) {
      return res.status(400).json({ message: 'User is not tagged in this post' });
    }

    post.tags = post.tags.filter(tag => tag.toString() !== userId);
    await post.save();

    return res.json({ message: 'Tag removed successfully' });
  } catch (err) {
    console.error((err as Error).message);
    return res.status(500).send('Server error');
  }
};