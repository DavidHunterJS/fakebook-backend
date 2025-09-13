import { Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Post from '../models/Post';
import Reaction from '../models/Reaction';
import Notification from '../models/Notification'; // Import the Notification model
import { AuthenticatedS3Request } from '../types/request.types';
import { ReactionType } from '../models/Reaction'; // Assuming ReactionType is defined here

// --- FIX: Add the missing type definition for ReactionCounts ---
type ReactionCounts = Record<ReactionType, number>;

const reactionController = {
  addOrUpdateReaction: async (req: AuthenticatedS3Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user?.id) {
      return res.status(401).json({ msg: 'User not authenticated. Access denied.' });
    }

    const postId = req.params.id;
    const userId = req.user.id;
    const { type } = req.body as { type: ReactionType };

    try {
      const postExists = await Post.findById(postId);
      if (!postExists) {
        return res.status(404).json({ msg: 'Post not found.' });
      }

      // Check if a reaction from this user already exists on this post
      const existingReaction = await Reaction.findOne({ postId, userId });

      const reaction = await Reaction.findOneAndUpdate(
        { postId, userId },
        { type },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // --- Notification Logic ---
      // Only create a notification if it's a new reaction (not an update)
      // and the user is not reacting to their own post.
      const isNotOwnPost = postExists.user.toString() !== userId;
      if (!existingReaction && isNotOwnPost) {
        await Notification.create({
          recipient: postExists.user,
          sender: userId,
          type: 'post_like', // You can use a more generic 'post_reaction' if you prefer
          content: `${req.user.username} reacted to your post.`,
          link: `/posts/${postId}`,
        });
      }
      // --- End of Notification Logic ---

      const reactionCounts = await Reaction.getReactionCounts(postId);

      return res.status(200).json({
        message: 'Reaction added or updated successfully.',
        reaction,
        counts: reactionCounts,
      });

    } catch (err: any) {
      console.error('Error in addOrUpdateReaction:', err.message);
      if (err.name === 'CastError') {
        return res.status(400).json({ msg: 'Invalid Post ID format.' });
      }
      return res.status(500).send('Server Error');
    }
  },

  removeReaction: async (req: AuthenticatedS3Request, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ msg: 'User not authenticated. Access denied.' });
    }
    const postId = req.params.id;
    const userId = req.user.id;
    try {
      const deletedReaction = await Reaction.findOneAndDelete({ postId, userId });
      
      // If a reaction was successfully deleted, also delete the corresponding notification
      if (deletedReaction) {
        await Notification.deleteOne({
          sender: userId,
          type: 'post_like',
          link: `/posts/${postId}`
        });
      }
      
      const reactionCounts = await Reaction.getReactionCounts(postId);

      return res.status(200).json({
        message: 'Reaction removed successfully.',
        counts: reactionCounts,
      });
    } catch (err: any) {
      console.error('Error in removeReaction:', err.message);
      if (err.name === 'CastError') {
        return res.status(400).json({ msg: 'Invalid Post ID format.' });
      }
      return res.status(500).send('Server Error');
    }
  },
};

export const getReactions = async (req: AuthenticatedS3Request, res: Response) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user?.id;

    const reactions = await Reaction.find({ postId });
    
    const defaultCounts: ReactionCounts = {
      like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0, care: 0, clap: 0,
      fire: 0, thinking: 0, celebrate: 0, mind_blown: 0, heart_eyes: 0,
      laugh_cry: 0, shocked: 0, cool: 0, party: 0, thumbs_down: 0
    };
    
    const counts = reactions.reduce((acc, reaction) => {
      // Create a mutable copy of the accumulator
      const newAcc = { ...acc };
      if (newAcc.hasOwnProperty(reaction.type)) {
        newAcc[reaction.type]++;
      }
      return newAcc;
    }, defaultCounts);
    
    let userReaction = null;
    if (userId) {
      const userReactionDoc = reactions.find(r => r.userId.toString() === userId);
      userReaction = userReactionDoc ? userReactionDoc.type : null;
    }
    
    res.json({
      counts,
      userReaction
    });
    
  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export default reactionController;
