// routes/conversation.routes.ts
import express, { Request, Response } from 'express';
import { Conversation, IConversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Types } from 'mongoose';
import  auth  from '../middlewares/auth.middleware';

const router = express.Router();

// GET /api/conversations - Get user's conversations
router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    
    const filter = {
      participants: {
      $elemMatch: {
      userId: userId,
      isActive: true
      }
      },
        lastMessage: { $exists: true },
        'settings.isArchived': false
      };

      // Log the exact filter being sent to the database
      console.log('--- EXECUTING CONVERSATION LIST QUERY ---', JSON.stringify(filter, null, 2));

    const conversations = await Conversation.find({
      participants: {
        $elemMatch: {
          userId: userId,
          isActive: true
        }
      },
      lastMessage: { $exists: true },
      'settings.isArchived': false
    })
    .populate({
      path: 'participants.userId',
      select: 'username firstName lastName profilePicture isOnline'
    })
    .populate('lastMessage.senderId', 'username firstName lastName profilePicture')
    .sort({ updatedAt: -1 })
    .lean();

    // Add unread count for this user
    const conversationsWithUnread = conversations.map(conv => {
      const unreadData = conv.unreadCount?.find(u => 
        u.userId.toString() === userId.toString()
      );
      return {
        ...conv,
        unreadCount: unreadData?.count || 0
      };
    });

    res.json({
      success: true,
      conversations: conversationsWithUnread
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations'
    });
  }
});

// GET /api/conversations/:id - Get specific conversation
router.get('/:id', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const conversationId = new Types.ObjectId(req.params.id);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: {
        $elemMatch: {
          userId: userId,
          isActive: true
        }
      }
    })
    .populate('participants.userId', 'name email avatar')
    .populate('createdBy', 'name avatar');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation'
    });
  }
});

// POST /api/conversations - Create new conversation

router.post('/', auth, async (req: Request, res: Response) => {
  console.log('--- CREATE CONVERSATION: RUNNING LATEST BACKEND CODE ---');
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const { type, participants, title } = req.body;

    // --- Validation ---
    if (!type || !participants || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Type and participants are required'
      });
    }
    if (type === 'direct' && participants.length !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Direct conversations must have exactly 2 participants'
      });
    }

    // --- Handle existing direct conversations ---
    if (type === 'direct') {
      const participantIds = [userId, new Types.ObjectId(participants[0])];
      
      // Find the conversation without populating first
      const existingConversation = await Conversation.findOne({
        type: 'direct',
        'participants.userId': { $all: participantIds }
      });

      if (existingConversation) {
        // ✅ THIS IS THE FINAL FIX: Use a single, atomic update operation

        const updateOps: any = {
          $set: {
            // Set all participants in the array to be active
            "participants.$[].isActive": true,
            "settings.isArchived": false
          },
          $unset: {
            // Remove the 'leftAt' field from all participants
            "participants.$[].leftAt": "" 
          }
        };
        
        // If the unreadCount field is missing on the old document, create it
        if (!existingConversation.unreadCount || existingConversation.unreadCount.length === 0) {
          const initialUnreadCount = existingConversation.participants.map(p => ({
            userId: p.userId,
            count: 0
          }));
          updateOps.$set.unreadCount = initialUnreadCount;
        }
        
        // Find the conversation by ID and apply all updates at once
        const updatedConversation = await Conversation.findByIdAndUpdate(
          existingConversation._id,
          updateOps,
          { new: true } // This option tells MongoDB to return the updated document
        ).populate({
            path: 'participants.userId',
            select: 'username firstName lastName profilePicture isOnline'
        }).lean();

        if (!updatedConversation) {
          return res.status(404).json({ success: false, message: 'Existing conversation not found' });
        }

        const unreadData = updatedConversation.unreadCount?.find(u => u.userId.toString() === userId.toString());
        const finalConversation = {
          ...updatedConversation,
          unreadCount: unreadData?.count || 0
        };
        
        console.log('--- LOG B: DOCUMENT AFTER PATCH ---', JSON.stringify(finalConversation, null, 2));
        
        return res.json({
          success: true,
          conversation: finalConversation,
          isExisting: true
        });
      }
    }

    // --- Create a new conversation ---
    const conversationParticipants = [
      { userId, role: 'admin', joinedAt: new Date(), isActive: true },
      ...participants.map((pId: string) => ({ userId: new Types.ObjectId(pId), role: 'member', joinedAt: new Date(), isActive: true }))
    ];

    const newConversation = new Conversation({
      type,
      participants: conversationParticipants,
      title: type === 'group' ? title : undefined,
      unreadCount: conversationParticipants.map(p => ({ userId: p.userId, count: 0 })),
      createdBy: userId,
      settings: {
        allowFileSharing: true,
        allowImageSharing: true,
        isArchived: false
      }
    });

    await newConversation.save();

    const populatedConversation = await Conversation.findById(newConversation._id)
      .populate({
        path: 'participants.userId',
        select: 'username firstName lastName profilePicture isOnline'
      })
      .lean();

    if (!populatedConversation) {
      return res.status(500).json({ success: false, message: "Failed to process created conversation." });
    }

    // Ensure the unreadCount is a number
    const unreadData = populatedConversation.unreadCount?.find(u => u.userId.toString() === userId.toString());
    const finalConversation = {
      ...populatedConversation,
      unreadCount: unreadData?.count || 0
    };

    console.log('--- LOG A: DOCUMENT AFTER CREATION ---', JSON.stringify(finalConversation, null, 2));
    
    // Send the corrected `finalConversation` object
    return res.status(201).json({
      success: true,
      conversation: finalConversation
    });

  } catch (error) {
    console.error('Create conversation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create conversation'
    });
  }
});

// PUT /api/conversations/:id - Update conversation
router.put('/:id', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const conversationId = new Types.ObjectId(req.params.id);
    const { title, description, settings, encryptionSettings } = req.body;

    // Check if user is admin of this conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants': {
        $elemMatch: {
          userId,
          role: 'admin',
          isActive: true
        }
      }
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this conversation'
      });
    }

    // Update allowed fields
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (settings) updateData.settings = { ...conversation.settings, ...settings };
    if (encryptionSettings) {
      updateData.encryptionSettings = { 
        ...conversation.encryptionSettings, 
        ...encryptionSettings 
      };
    }

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      updateData,
      { new: true }
    )
    .populate('participants.userId', 'name email avatar')
    .populate('createdBy', 'name avatar');

    res.json({
      success: true,
      conversation: updatedConversation
    });

  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update conversation'
    });
  }
});

// DELETE /api/conversations/:id - Archive conversation
router.delete('/:id', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const conversationId = new Types.ObjectId(req.params.id);

    // Check if user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId,
      'participants.isActive': true
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // For direct messages, mark as archived for this user
    // For group chats, remove user from participants
    if (conversation.type === 'direct') {
      await Conversation.findOneAndUpdate(
        { 
          _id: conversationId,
          'participants.userId': userId 
        },
        { 
          $set: { 'participants.$.leftAt': new Date() }
        }
      );
    } else {
      await Conversation.findOneAndUpdate(
        { 
          _id: conversationId,
          'participants.userId': userId 
        },
        { 
          $set: { 
            'participants.$.isActive': false,
            'participants.$.leftAt': new Date()
          }
        }
      );
    }

    res.json({
      success: true,
      message: 'Left conversation successfully'
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave conversation'
    });
  }
});

// POST /api/conversations/:id/participants - Add participants
router.post('/:id/participants', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const conversationId = new Types.ObjectId(req.params.id);
    const { participants } = req.body;

    if (!participants || participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Participants are required'
      });
    }

    // Check if user is admin
    const conversation = await Conversation.findOne({
      _id: conversationId,
      type: 'group', // Only group chats allow adding participants
      'participants': {
        $elemMatch: {
          userId,
          role: 'admin',
          isActive: true
        }
      }
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add participants'
      });
    }

    // Add new participants
    const newParticipants = participants.map((participantId: string) => ({
      userId: new Types.ObjectId(participantId),
      role: 'member',
      joinedAt: new Date(),
      isActive: true
    }));

    await Conversation.findByIdAndUpdate(conversationId, {
      $push: { 
        participants: { $each: newParticipants },
        unreadCount: { 
          $each: newParticipants.map((p: { userId: Types.ObjectId }) => ({
            userId: p.userId,
            count: 0
          }))
        }
      }
    });

    const updatedConversation = await Conversation.findById(conversationId)
      .populate('participants.userId', 'name email avatar');

    res.json({
      success: true,
      conversation: updatedConversation
    });

  } catch (error) {
    console.error('Add participants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add participants'
    });
  }
});

export default router;