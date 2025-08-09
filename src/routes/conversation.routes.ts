// src/routes/conversation.routes.ts
import express, { Request, Response } from 'express';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import User from '../models/User';
import authMiddleware  from '../middlewares/auth.middleware';
import { IUser } from '../types/user.types';
import mongoose from 'mongoose'; // Make sure this is imported

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const router = express.Router();

// Get all conversations for the authenticated user
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    // Use simple find + populate approach instead of complex aggregation
    const conversations = await Conversation.find({
      'participants.userId': userId
    })
    .populate('participants.userId', 'username firstName lastName profilePicture isOnline')
    .sort({ lastActivity: -1 })
    .limit(50);
    
    console.log('🔍 Conversations details:', conversations.map(c => ({
      id: c._id,
      type: c.type,
      participantCount: c.participants?.length
    })));

    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
});

// Create a new conversation
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    
    const userId = req.user?.id;
    const { participantIds, type, name, settings } = req.body;
    

    // Validation
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ message: 'Participant IDs are required' });
    }

    if (type === 'group' && !name) {
      return res.status(400).json({ message: 'Group conversations require a name' });
    }

    // For direct messages, ensure only 2 participants
    if (type === 'direct' && participantIds.length !== 1) {
      return res.status(400).json({ message: 'Direct conversations must have exactly 2 participants' });
    }

    // Check if direct conversation already exists
    // Check if direct conversation already exists
    if (type === 'direct') {
      const existingConversation = await Conversation.findOne({
        type: 'direct',
        $and: [
          { 'participants.userId': userId },
          { 'participants.userId': participantIds[0] }
        ]
      });

      if (existingConversation) {
        // Populate the existing conversation before returning
        const populatedExisting = await Conversation.findById(existingConversation._id)
          .populate('participants.userId', 'username firstName lastName profilePicture isOnline');
          
        return res.status(200).json({
          message: 'Direct conversation already exists',
          conversation: populatedExisting
        });
      }
    }

    // Convert string IDs to ObjectIds and verify all participants exist
    const allParticipantIds = [userId, ...participantIds];
    
    // Convert all IDs to ObjectId instances for consistent comparison
    const objectIds = allParticipantIds.map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (error) {
        throw new Error(`Invalid user ID format: ${id}`);
      }
    });
    
    console.log('🔍 Looking for users with ObjectIds:', objectIds.map(id => id.toString()));
    
    const users = await User.find({ _id: { $in: objectIds } });
    
    
    if (users.length !== objectIds.length) {
      
      // Find which users are missing for better error reporting
      const foundIds = users.map(u => u._id.toString());
      const expectedIds = objectIds.map(id => id.toString());
      const missingIds = expectedIds.filter(id => !foundIds.includes(id));
      
      
      return res.status(400).json({ 
        message: 'One or more participants not found',
        missingIds 
      });
    }
    
    
    // Create participants array - creator is admin for groups
    const participants = objectIds.map(id => ({
      userId: id,
      role: (type === 'group' && id.toString() === userId) ? 'admin' : 'member',
      joinedAt: new Date(),
      permissions: (type === 'group' && id.toString() === userId) ? {
        canDeleteMessages: true,
        canKickUsers: true,
        canChangeSettings: true,
        canAddMembers: true
      } : undefined
    }));

    const conversation = await Conversation.create({
      participants,
      type,
      name,
      settings: settings || {},
      lastActivity: new Date()
    });

    // Populate participant details
    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants.userId', 'username firstName lastName profilePicture isOnline');

    res.status(201).json({ 
      message: 'Conversation created successfully', 
      conversation: populatedConversation 
    });

  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ 
      message: 'Failed to create conversation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get conversation details
router.get('/:conversationId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    }).populate('participants.userId', 'username firstName lastName profilePicture isOnline');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    res.json({ conversation });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ message: 'Failed to fetch conversation' });
  }
});

// Add participants to group conversation
router.post('/:conversationId/participants', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const { participantIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({ message: 'Participant IDs are required' });
    }

    // Check if user has permission to add members
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (conversation.type !== 'group') {
      return res.status(400).json({ message: 'Can only add participants to group conversations' });
    }

    const userParticipant = conversation.participants.find(p => p.userId.toString() === userId);
    if (!userParticipant) {
      return res.status(403).json({ message: 'You are not a participant in this conversation' });
    }

    const canAddMembers = userParticipant.role === 'admin' && 
      (userParticipant.permissions?.canAddMembers !== false);

    if (!canAddMembers) {
      return res.status(403).json({ message: 'You do not have permission to add members' });
    }

    // Verify new participants exist and aren't already in conversation
    const existingParticipantIds = conversation.participants.map(p => p.userId.toString());
    const newParticipantIds = participantIds.filter(id => !existingParticipantIds.includes(id));

    if (newParticipantIds.length === 0) {
      return res.status(400).json({ message: 'All users are already participants' });
    }

    // Convert to ObjectIds and verify users exist
    const objectIds = newParticipantIds.map(id => new mongoose.Types.ObjectId(id));
    const users = await User.find({ _id: { $in: objectIds } });
    
    if (users.length !== newParticipantIds.length) {
      return res.status(400).json({ message: 'One or more users not found' });
    }

    // Add new participants
    const newParticipants = objectIds.map(id => ({
      userId: id,
      role: 'member' as const,
      joinedAt: new Date()
    }));

    await Conversation.updateOne(
      { _id: conversationId },
      { 
        $push: { participants: { $each: newParticipants } },
        $set: { lastActivity: new Date() }
      }
    );

    res.json({ message: 'Participants added successfully' });

  } catch (error) {
    console.error('Error adding participants:', error);
    res.status(500).json({ message: 'Failed to add participants' });
  }
});

// Leave conversation
router.delete('/:conversationId/leave', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Remove user from participants
    await Conversation.updateOne(
      { _id: conversationId },
      { 
        $pull: { participants: { userId } },
        $set: { lastActivity: new Date() }
      }
    );

    // If no participants left, delete conversation
    const updatedConversation = await Conversation.findById(conversationId);
    if (updatedConversation && updatedConversation.participants.length === 0) {
      await Conversation.deleteOne({ _id: conversationId });
      await Message.deleteMany({ conversationId });
    }

    res.json({ message: 'Left conversation successfully' });

  } catch (error) {
    console.error('Error leaving conversation:', error);
    res.status(500).json({ message: 'Failed to leave conversation' });
  }
});

// Update conversation settings (admin only)
router.patch('/:conversationId/settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const { settings } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Check admin permissions
    const userParticipant = conversation.participants.find(p => p.userId.toString() === userId);
    if (!userParticipant || userParticipant.role !== 'admin') {
      return res.status(403).json({ message: 'Admin privileges required' });
    }

    const canChangeSettings = userParticipant.permissions?.canChangeSettings !== false;
    if (!canChangeSettings) {
      return res.status(403).json({ message: 'You do not have permission to change settings' });
    }

    await Conversation.updateOne(
      { _id: conversationId },
      { 
        $set: { 
          settings: { ...conversation.settings, ...settings },
          lastActivity: new Date()
        }
      }
    );

    res.json({ message: 'Settings updated successfully' });

  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

export default router;