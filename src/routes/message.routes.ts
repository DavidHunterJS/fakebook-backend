// src/routes/message.ts
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import Message, { IMessage } from '../models/Message';
import Conversation from '../models/Conversation';
import ReadReceipt from '../models/ReadReceipt';
import authMiddleware from '../middlewares/auth.middleware';
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';
import { IUser } from '../types/user.types';


interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const router = express.Router();

router.get('/:conversationId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Step 1: Fetch messages as before
    const messages = await Message.find({
      conversationId,
      isDeleted: false
    })
    .populate('senderId', '_id username firstName lastName profilePicture')
    .populate({ path: 'reactions.userId', select: '_id username firstName lastName' })
    .sort({ timestamp: 1 })
    .limit(100) // It's good practice to limit the initial load
    .lean();

    const messageIds = messages.map(m => m._id);

    // Step 2: Fetch all relevant read receipts for these messages in a single query
    const receipts = await ReadReceipt.find({ messageId: { $in: messageIds } })
      .populate('userId', '_id firstName lastName profilePicture')
      .lean();

    // Step 3: Group the receipts by messageId for efficient lookup
    const receiptsByMessageId = new Map<string, any[]>();
    for (const receipt of receipts) {
      const messageIdStr = receipt.messageId.toString();
      if (!receiptsByMessageId.has(messageIdStr)) {
        receiptsByMessageId.set(messageIdStr, []);
      }
      // This structure matches the frontend's 'ReadBy' interface
      receiptsByMessageId.get(messageIdStr)?.push({
        userId: receipt.userId,
        readAt: receipt.readAt
      });
    }

    // Step 4: Combine messages with their sender, reactions, and now read receipts
    const formattedMessages = messages.map(msg => {
      const senderObject = msg.senderId as any;
      const msgIdStr = msg._id.toString();

      const formattedReactions = (msg.reactions || []).map(r => ({
        emoji: r.emoji,
        timestamp: r.timestamp,
        userId: (r.userId as any)._id,
        user: r.userId
      }));

      return {
        ...msg,
        senderId: senderObject._id,
        sender: senderObject,
        reactions: formattedReactions,
        // Attach the receipts to each message object
        readBy: receiptsByMessageId.get(msgIdStr) || [],
      };
    });

    res.json({ messages: formattedMessages });

  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// Get unread message count across all conversations
router.get('/unread/count', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Get all conversations the user is in
    const conversations = await Conversation.find({
      'participants.userId': userId
    }).select('_id');
    
    const conversationIds = conversations.map(c => c._id);
    
    // Get all messages in these conversations not sent by the user
    const messages = await Message.find({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      isDeleted: { $ne: true }
    }).select('_id conversationId');
    
    // Get all read receipts by this user for these messages
    const messageIds = messages.map(m => m._id);
    const readReceipts = await ReadReceipt.find({
      messageId: { $in: messageIds },
      userId: userId
    }).select('messageId');
    
    const readMessageIds = new Set(readReceipts.map(r => r.messageId.toString()));
    
    // Count unread messages per conversation
    const unreadByConversation: { [key: string]: number } = {};
    let totalUnread = 0;
    
    messages.forEach(message => {
      if (!readMessageIds.has(message._id.toString())) {
        const convId = message.conversationId.toString();
        unreadByConversation[convId] = (unreadByConversation[convId] || 0) + 1;
        totalUnread++;
      }
    });
    
    res.json({
      totalUnread,
      byConversation: unreadByConversation
    });
    
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

// Mark messages as read
router.post('/read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { messageIds, conversationId } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: 'Invalid message IDs' });
    }
    
    // Verify user is in the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    });
    
    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized for this conversation' });
    }
    
    // Verify all messages belong to this conversation
    const messages = await Message.find({
      _id: { $in: messageIds },
      conversationId: conversationId
    }).select('_id senderId');
    
    if (messages.length !== messageIds.length) {
      return res.status(400).json({ message: 'Some messages not found or don\'t belong to this conversation' });
    }
    
    // Filter out messages sent by the current user
    const messagesToMark = messages.filter(m => m.senderId.toString() !== userId);
    
    if (messagesToMark.length === 0) {
      return res.json({ message: 'No messages to mark as read' });
    }
    
    // Create read receipts using bulkWrite for efficiency
    const bulkOps = messagesToMark.map(message => ({
      updateOne: {
        filter: {
          messageId: message._id,
          userId: new mongoose.Types.ObjectId(userId)
        },
        update: {
          $set: {
            conversationId: new mongoose.Types.ObjectId(conversationId),
            readAt: new Date()
          }
        },
        upsert: true
      }
    }));
    
    await ReadReceipt.bulkWrite(bulkOps);
    
    res.json({ 
      message: 'Messages marked as read',
      markedCount: messagesToMark.length 
    });
    
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Failed to mark messages as read' });
  }
});

// Get read receipt details for a specific message
router.get('/:messageId/receipts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { messageId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Verify message exists
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Verify user is in the conversation
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      'participants.userId': userId
    });
    
    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Get read receipts with user details
    const readReceipts = await ReadReceipt.find({ messageId })
      .populate('userId', '_id firstName lastName profilePicture username')
      .sort({ readAt: 1 });
    
    res.json({
      messageId,
      receipts: readReceipts.map(r => ({
        user: r.userId,
        readAt: r.readAt
      })),
      totalReads: readReceipts.length
    });
    
  } catch (error) {
    console.error('Error getting read receipts:', error);
    res.status(500).json({ message: 'Failed to get read receipts' });
  }
});

// Get last read message for each participant in a conversation
router.get('/conversation/:conversationId/last-read', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Verify user is in the conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    }).populate('participants.userId', '_id firstName lastName profilePicture');
    
    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized for this conversation' });
    }
    
    // Get the last read message for each participant
    const participantIds = conversation.participants.map(p => p.userId._id);
    
    // Aggregate to find the latest read receipt for each user
    const lastReadReceipts = await ReadReceipt.aggregate([
      {
        $match: {
          conversationId: new mongoose.Types.ObjectId(conversationId),
          userId: { $in: participantIds }
        }
      },
      {
        $sort: { readAt: -1 }
      },
      {
        $group: {
          _id: '$userId',
          lastMessageId: { $first: '$messageId' },
          lastReadAt: { $first: '$readAt' }
        }
      }
    ]);
    
    // Get the actual messages for context
    const messageIds = lastReadReceipts.map(r => r.lastMessageId);
    const messages = await Message.find({ _id: { $in: messageIds } })
      .select('_id content timestamp senderId');
    
    const messageMap = new Map(messages.map(m => [m._id.toString(), m]));
    
    // Format the response
    const lastReadInfo = lastReadReceipts.map(receipt => {
      const participant = conversation.participants.find(
        p => p.userId._id.toString() === receipt._id.toString()
      );
      const message = messageMap.get(receipt.lastMessageId.toString());
      
      return {
        user: participant?.userId,
        lastReadMessage: message,
        lastReadAt: receipt.lastReadAt
      };
    });
    
    res.json({
      conversationId,
      lastReadInfo
    });
    
  } catch (error) {
    console.error('Error getting last read info:', error);
    res.status(500).json({ message: 'Failed to get last read info' });
  }
});

// Upload chat file endpoint
router.post('/upload', authMiddleware, s3UploadMiddleware.chatFile, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.body;
    const chatFile = (req as any).chatFile;

    console.log('📎 POST /messages/upload - File upload for conversation:', conversationId);

    if (!chatFile) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!conversationId) {
      return res.status(400).json({ message: 'Conversation ID is required' });
    }

    // Verify user is participant in conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found or access denied' });
    }

    // Create file message
    const message = await Message.create({
      conversationId,
      senderId: userId,
      content: {
        file: {
          fileName: chatFile.fileName,
          fileSize: chatFile.fileSize,
          fileType: chatFile.fileType,
          fileUrl: chatFile.fileUrl,
          s3Key: chatFile.s3Key
        }
      },
      messageType: 'file',
      timestamp: new Date(),
      isDeleted: false
    });

    // Update conversation last activity
    await Conversation.updateOne(
      { _id: conversationId },
      { lastActivity: new Date() }
    );

    // Populate sender details
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username firstName lastName profilePicture');

    // Broadcast file message to all participants via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(conversationId).emit('newChatMessage', {
        message: populatedMessage,
        sender: {
          id: userId,
          username: req.user?.username,
          firstName: req.user?.firstName,
          lastName: req.user?.lastName
        }
      });
      console.log('📡 File message broadcasted via socket');
    }

    console.log('✅ File message created successfully');

    res.status(201).json({
      message: 'File uploaded successfully',
      data: populatedMessage
    });

  } catch (error) {
    console.error('❌ Error uploading chat file:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
});

// Search messages in a conversation
router.get('/:conversationId/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const messages = await Message.find({
      conversationId,
      isDeleted: false,
      'content.text': { $regex: q, $options: 'i' }
    })
    .populate('senderId', 'username firstName lastName')
    .sort({ timestamp: -1 })
    .limit(Number(limit));

    res.json({ messages });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ message: 'Failed to search messages' });
  }
});

// Add reaction to message via HTTP
router.post('/:messageId/reactions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    console.log('👍 POST /messages/:messageId/reactions - Adding reaction:', { messageId, emoji });

    // Find and verify message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify user access to conversation
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      'participants.userId': userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized for this conversation' });
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      r => r.userId.toString() === userId && r.emoji === emoji
    );

    if (existingReaction) {
      return res.status(400).json({ message: 'User already reacted with this emoji' });
    }

    // Add reaction
    await Message.updateOne(
      { _id: messageId },
      { 
        $push: { 
          reactions: { 
            userId, 
            emoji, 
            timestamp: new Date() 
          } 
        }
      }
    );

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(message.conversationId.toString()).emit('reactionAdded', {
        messageId,
        userId,
        emoji,
        username: req.user?.username,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        timestamp: new Date()
      });
    }

    res.json({ message: 'Reaction added successfully' });

  } catch (error) {
    console.error('❌ Error adding reaction:', error);
    res.status(500).json({ message: 'Failed to add reaction' });
  }
});

// Remove reaction from message via HTTP
router.delete('/:messageId/reactions/:emoji', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { messageId, emoji } = req.params;

    console.log('👎 DELETE /messages/:messageId/reactions/:emoji - Removing reaction:', { messageId, emoji });

    // Find and verify message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify user access
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      'participants.userId': userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized for this conversation' });
    }

    // Remove reaction
    await Message.updateOne(
      { _id: messageId },
      { 
        $pull: { 
          reactions: { 
            userId: userId, 
            emoji: emoji 
          } 
        }
      }
    );

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(message.conversationId.toString()).emit('reactionRemoved', {
        messageId,
        userId,
        emoji,
        username: req.user?.username,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        timestamp: new Date()
      });
    }

    res.json({ message: 'Reaction removed successfully' });

  } catch (error) {
    console.error('❌ Error removing reaction:', error);
    res.status(500).json({ message: 'Failed to remove reaction' });
  }
});

export default router;