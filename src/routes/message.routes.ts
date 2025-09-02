// routes/message.routes.ts
import express, { Request, Response } from 'express';
import { Message, IMessage } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { Types } from 'mongoose';
import auth  from '../middlewares/auth.middleware';

const router = express.Router();

// GET /api/messages/:conversationId - Get messages for a conversation
  router.get('/:conversationId', auth, async (req: Request, res: Response) => {
    try {
      const userId = new Types.ObjectId(req.user?.id);
      const conversationId = new Types.ObjectId(req.params.conversationId);
      
      console.log('Loading messages - User ID:', userId.toString()); // Debug
      console.log('Loading messages - Conversation ID:', conversationId.toString());

      // Pagination params
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      // Verify user has access to this conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: {
          $elemMatch: {
            userId: userId,
            isActive: true
          }
        }
      });
      
      console.log('Conversation found:', !!conversation); // Debug
      console.log('Conversation participants:', conversation?.participants); 

      if (!conversation) {
        const conversationAlt = await Conversation.findById(conversationId);
        console.log('Alternative conversation check:', conversationAlt?.participants); 
        return res.status(403).json({
          success: false,
          message: 'Access denied to this conversation'
        });
      }

      // Get messages with pagination (newest first)
      const messages = await Message.find({
        conversationId,
        isDeleted: false
      })
      .populate('senderId', '_id username firstName lastName profilePicture')
      .populate('replyTo', 'content senderId')
      .populate({
        path: 'reactions.userId',
        select: 'firstName lastName username' // Select fields needed for tooltips, etc.
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

      // Get total count for pagination
      const totalMessages = await Message.countDocuments({
        conversationId,
        isDeleted: false
      });

      // Mark messages as read for this user
      await Message.updateMany(
        {
          conversationId,
          'readBy.userId': { $ne: userId }
        },
        {
          $push: {
            readBy: {
              userId,
              readAt: new Date()
            }
          }
        }
      );

      // Update unread count in conversation
      await Conversation.updateOne(
        {
          _id: conversationId,
          'unreadCount.userId': userId
        },
        {
          $set: { 'unreadCount.$.count': 0 }
        }
      );

      res.json({
        success: true,
        messages: messages.reverse(), // Return oldest first for chat display
        pagination: {
          page,
          limit,
          total: totalMessages,
          pages: Math.ceil(totalMessages / limit),
          hasNext: page < Math.ceil(totalMessages / limit),
          hasPrev: page > 1
        }
      });

    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages'
      });
    }
  });

// POST /api/messages - Send a new message
router.post('/', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const { 
      conversationId, 
      content, 
      messageType = 'text',
      metadata,
      replyTo 
    } = req.body;

    if (!conversationId || !content?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Conversation ID and content are required'
      });
    }

    const convId = new Types.ObjectId(conversationId);

    // Verify user can send messages to this conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: {
        $elemMatch: {
          userId: userId,
          isActive: true
        }
      }
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message to this conversation'
      });
    }

    // Create the message
    const message = new Message({
      conversationId: convId,
      senderId: userId,
      content: content.trim(),
      messageType,
      metadata,
      replyTo: replyTo ? new Types.ObjectId(replyTo) : undefined,
      readBy: [{
        userId,
        readAt: new Date()
      }],
      isDeleted: false
    });

    await message.save();

    // Update conversation's last message and unread counts
    const updateData: any = {
      lastMessage: {
        messageId: message._id,
        content: message.content,
        senderId: userId,
        sentAt: message.createdAt
      },
      updatedAt: new Date()
    };

    // Increment unread count for other participants
    const otherParticipants = conversation.participants.filter(
      (p: any) => p.userId.toString() !== userId.toString() && p.isActive
    );

    if (otherParticipants.length > 0) {
      await Conversation.updateOne(
        { _id: convId },
        {
          $set: updateData,
          $inc: {
            ...otherParticipants.reduce((acc: any, participant: any) => {
              acc[`unreadCount.$[elem${participant.userId}].count`] = 1;
              return acc;
            }, {})
          }
        },
        {
          arrayFilters: otherParticipants.map((participant: any) => ({
            [`elem${participant.userId}.userId`]: participant.userId
          }))
        }
      );
    } else {
      await Conversation.updateOne({ _id: convId }, { $set: updateData });
    }

    // Populate the message for response
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', '_id username firstName lastName profilePicture') // <-- CHANGE THIS LINE
      .populate('replyTo', 'content senderId');

    console.log("--- BACKEND DEBUG: Final message object before broadcast ---");
    console.log(JSON.stringify(populatedMessage, null, 2));
    
    res.status(201).json({
      success: true,
      message: populatedMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

// PUT /api/messages/:id - Edit a message
router.put('/:id', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const messageId = new Types.ObjectId(req.params.id);
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    // Find message and verify ownership
    const message = await Message.findOne({
      _id: messageId,
      senderId: userId,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or access denied'
      });
    }

    // Check if message is too old to edit (optional: 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinutesAgo) {
      return res.status(400).json({
        success: false,
        message: 'Message is too old to edit'
      });
    }

    // Update the message
    message.content = content.trim();
    message.editedAt = new Date();
    await message.save();

    // Update last message in conversation if this was the latest
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation?.lastMessage?.messageId?.toString() === messageId.toString()) {
      await Conversation.updateOne(
        { _id: message.conversationId },
        {
          $set: {
            'lastMessage.content': message.content,
            updatedAt: new Date()
          }
        }
      );
    }

    const populatedMessage = await Message.findById(messageId)
      .populate('senderId', '_id username firstName lastName profilePicture') // <-- FIX THIS LINE
      .populate('replyTo', 'content senderId');

    res.json({
      success: true,
      message: populatedMessage
    });

  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to edit message'
    });
  }
});

// DELETE /api/messages/:id - Delete a message
router.delete('/:id', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const messageId = new Types.ObjectId(req.params.id);

    // Find message and verify ownership
    const message = await Message.findOne({
      _id: messageId,
      senderId: userId,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or access denied'
      });
    }

    // Soft delete the message
    message.isDeleted = true;
    message.content = 'This message was deleted';
    await message.save();

    // If this was the last message, update conversation
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation?.lastMessage?.messageId?.toString() === messageId.toString()) {
      // Find the previous message
      const previousMessage = await Message.findOne({
        conversationId: message.conversationId,
        isDeleted: false,
        _id: { $ne: messageId }
      })
      .sort({ createdAt: -1 })
      .populate('senderId', '_id username firstName lastName');

      if (previousMessage) {
        await Conversation.updateOne(
          { _id: message.conversationId },
          {
            $set: {
              lastMessage: {
                messageId: previousMessage._id,
                content: previousMessage.content,
                senderId: previousMessage.senderId,
                sentAt: previousMessage.createdAt
              },
              updatedAt: new Date()
            }
          }
        );
      } else {
        // No previous messages, clear last message
        await Conversation.updateOne(
          { _id: message.conversationId },
          {
            $unset: { lastMessage: 1 },
            $set: { updatedAt: new Date() }
          }
        );
      }
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message'
    });
  }
});

// POST /api/messages/:id/read - Mark message as read
router.post('/:id/read', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const messageId = new Types.ObjectId(req.params.id);

    // Add user to readBy array if not already there
    await Message.updateOne(
      {
        _id: messageId,
        'readBy.userId': { $ne: userId }
      },
      {
        $push: {
          readBy: {
            userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      message: 'Message marked as read'
    });

  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read'
    });
  }
});

// GET /api/messages/search/:conversationId - Search messages in conversation
router.get('/search/:conversationId', auth, async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user?.id);
    const conversationId = new Types.ObjectId(req.params.conversationId);
    const { q, limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Verify access to conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId,
      'participants.isActive': true
    });

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this conversation'
      });
    }

    // Search messages
    const messages = await Message.find({
      conversationId,
      isDeleted: false,
      content: { $regex: q, $options: 'i' }
    })
    .populate('senderId', '_id username firstName lastName profilePicture') 
    .sort({ createdAt: -1 })
    .limit(parseInt(limit as string));

    res.json({
      success: true,
      messages,
      query: q
    });

  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search messages'
    });
  }
});

export default router;