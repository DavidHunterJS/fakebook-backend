import { Response } from 'express';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose'; // Ensure mongoose is imported
import Post from '../models/Post';
import Reaction, { ReactionType } from '../models/Reaction';
import { AuthenticatedRequest } from '../types/request.types';

const reactionController = {
  addOrUpdateReaction: async (req: AuthenticatedRequest, res: Response) => {
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

    // --- START OF NEW DEBUGGING LOGS ---
    console.log('--- DEBUGGING REACTION CONTROLLER ---');
    console.log(`[${new Date().toISOString()}] Received request for Post ID:`, postId);
    // This tells us the status of the database connection: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    console.log('Mongoose Connection Ready State:', mongoose.connection.readyState); 
    console.log('Looking for post...');
    // --- END OF NEW DEBUGGING LOGS ---

    try {
      const postExists = await Post.findById(postId);

      // --- MORE DEBUGGING ---
      console.log('Result of Post.findById():', postExists); // This will be null if not found
      // --- END OF MORE DEBUGGING ---

      if (!postExists) {
        console.error(`--> Post with ID ${postId} NOT FOUND in database.`); // Explicit log on failure
        return res.status(404).json({ msg: 'Post not found.' });
      }

      console.log('--> Post found successfully! Proceeding with reaction.');
      
      const reaction = await Reaction.findOneAndUpdate(
        { postId, userId },
        { type },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const reactionCounts = await Reaction.getReactionCounts(postId);

      return res.status(200).json({
        message: 'Reaction added or updated successfully.',
        reaction,
        counts: reactionCounts,
      });

    } catch (err: any) {
      console.error('--- CATCH BLOCK ERROR in addOrUpdateReaction: ---', err);
      if (err.name === 'CastError') {
        return res.status(400).json({ msg: 'Invalid Post ID format.' });
      }
      return res.status(500).send('Server Error');
    }
  },

  // (The removeReaction function remains the same)
  removeReaction: async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) {
      return res.status(401).json({ msg: 'User not authenticated. Access denied.' });
    }
    const postId = req.params.id;
    const userId = req.user.id;
    try {
      const deletedReaction = await Reaction.findOneAndDelete({ postId, userId });
      if (!deletedReaction) {
        return res.status(404).json({ msg: 'Reaction not found for this user on the specified post.' });
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

// In your reactionController file
export const getReactions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user?.id; // Assuming you have user info from auth middleware

    // Get all reactions for this post
    const reactions = await Reaction.find({ postId });
    
    // Calculate counts
    const counts = {
      like: 0,
      love: 0,
      haha: 0,
      wow: 0,
      sad: 0,
      angry: 0,
      care: 0,
      clap: 0,
      fire: 0,
      thinking: 0,
      celebrate: 0,
      mind_blown: 0,
      heart_eyes: 0,
      laugh_cry: 0,
      shocked: 0,
      cool: 0,
      party: 0,
      thumbs_down: 0
    };
    
    reactions.forEach(reaction => {
      if (counts.hasOwnProperty(reaction.type)) {
        counts[reaction.type]++;
      }
    });
    
    // Find user's reaction if authenticated
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
