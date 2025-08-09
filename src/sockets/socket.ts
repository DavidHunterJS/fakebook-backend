// src/sockets/socket.ts
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import { IUser, IAuthPayload } from '../types/user.types';
import Conversation, { IConversation } from '../models/Conversation';
import Message, { IMessage } from '../models/Message';
import ReadReceipt, { IReadReceipt } from '../models/ReadReceipt';
import { checkAdminPermission } from '../utils/chatPermissions';

interface CustomSocket extends Socket {
  user?: IUser;
}

export default (io: Server): void => {
  // Authentication middleware for socket.io
  io.use(async (socket: CustomSocket, next) => {
    const authTimeout = setTimeout(() => {
      next(new Error('Authentication timeout'));
    }, 5000);
    
    try {
      const token = socket.handshake.auth.token;
      if (!token) { 
        clearTimeout(authTimeout);
        return next(new Error('Authentication error: No token provided'));
      }
      
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        clearTimeout(authTimeout);
        throw new Error('JWT_SECRET is not defined');
      }
      
      const decoded = jwt.verify(token, jwtSecret) as IAuthPayload;
      const user = await User.findById(decoded.user.id).select('-password');
      
      if (!user || !user.isActive) {
        clearTimeout(authTimeout);
        return next(new Error('User not found or inactive'));
      }
      
      socket.user = user;
      clearTimeout(authTimeout);
      next();
    } catch (err) {
      clearTimeout(authTimeout);
      console.error('Socket authentication error:', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: CustomSocket) => {
    if (!socket.user) {
      console.log('Socket connected without user data');
      socket.disconnect();
      return;
    }
    
    const user = socket.user;
    const userId = user.id.toString();
    console.log(`User connected: ${user.username} (ID: ${userId})`);
    
    // Join personal room for targeted events
    socket.join(userId);
    
    // Set user online status
    User.findByIdAndUpdate(userId, { isOnline: true }, { new: true })
      .then(() => {
        // Notify friends user is online
        if (user.friends && user.friends.length > 0) {
          user.friends.forEach(friend => {
            try {
              const friendId = typeof friend === 'string' ? friend : 
                friend._id ? friend._id.toString() : null;
                
              if (friendId) {
                io.to(friendId).emit('friendOnline', { userId });
              }
            } catch (error) {
              console.error('Error notifying friend about online status:', error);
            }
          });
        }
      })
      .catch(err => {
        console.error('Error updating user online status:', err);
      });
    
    // Handle new posts
    socket.on('newPost', (data: { postId: string }) => {
      try {
        if (!data.postId) {
          return socket.emit('error', { message: 'Invalid post data' });
        }
        
        // Broadcast to all followers/friends
        if (user.friends && user.friends.length > 0) {
          user.friends.forEach(friend => {
            const friendId = typeof friend === 'string' ? friend : 
              friend._id ? friend._id.toString() : null;
              
            if (friendId) {
              io.to(friendId).emit('newFriendPost', { 
                userId,
                postId: data.postId 
              });
            }
          });
        }
      } catch (error) {
        console.error('Error handling newPost event:', error);
      }
    });
    
    // Handle friend requests
    socket.on('sendFriendRequest', async (data: { recipientId: string }) => {
      try {
        if (!data.recipientId) {
          return socket.emit('error', { message: 'Invalid friend request data' });
        }
        
        io.to(data.recipientId).emit('newFriendRequest', {
          senderId: userId,
          senderName: `${user.firstName} ${user.lastName}`
        });
      } catch (error) {
        console.error('Error handling sendFriendRequest event:', error);
      }
    });
    
    // Real-time messaging
    socket.on('sendMessage', (data: { recipientId: string, message: string }) => {
      try {
        if (!data.recipientId || !data.message) {
          return socket.emit('error', { message: 'Invalid message data' });
        }
        
        io.to(data.recipientId).emit('newMessage', {
          senderId: userId,
          message: data.message,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Error handling sendMessage event:', error);
      }
    });
    
    // Handle typing indicators
    socket.on('typing', (data: { recipientId: string, isTyping: boolean }) => {
      try {
        if (!data.recipientId) {
          return socket.emit('error', { message: 'Invalid typing data' });
        }
        
        io.to(data.recipientId).emit('userTyping', {
          userId,
          isTyping: data.isTyping
        });
      } catch (error) {
        console.error('Error handling typing event:', error);
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnecting: ${user.username}`);
      
      User.findByIdAndUpdate(userId, { isOnline: false, lastActive: new Date() })
        .then(() => {
          // Notify friends user is offline
          if (user.friends && user.friends.length > 0) {
            user.friends.forEach(friend => {
              try {
                const friendId = typeof friend === 'string' ? friend : 
                  friend._id ? friend._id.toString() : null;
                  
                if (friendId) {
                  io.to(friendId).emit('friendOffline', { userId });
                }
              } catch (error) {
                console.error('Error notifying friend about offline status:', error);
              }
            });
          }
          console.log(`User disconnected: ${user.username}`);
        })
        .catch(err => {
          console.error('Error updating user offline status:', err);
        });
    });

    // Join conversation room
    socket.on('joinConversation', async (data: { conversationId: string }) => {
      try {
        if (!data.conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        // Verify user is a participant in this conversation
        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        socket.join(data.conversationId);
        socket.emit('joinedConversation', { conversationId: data.conversationId });
        
      } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Leave conversation room
    socket.on('leaveConversation', (data: { conversationId: string }) => {
      try {
        socket.leave(data.conversationId);
        socket.emit('leftConversation', { conversationId: data.conversationId });
      } catch (error) {
        console.error('Error leaving conversation:', error);
      }
    });

    // Send chat message
    socket.on('sendChatMessage', async (data: { 
      conversationId: string, 
      content: { text?: string, file?: any, gif?: any }, 
      messageType: 'text' | 'file' | 'gif' 
    }) => {
      try {
        if (!data.conversationId || !data.content) {
          return socket.emit('error', { message: 'Invalid message data' });
        }
        
        // Verify user is in conversation
        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        // Create message
        const message = await Message.create({
          conversationId: data.conversationId,
          senderId: userId,
          content: data.content,
          messageType: data.messageType,
          timestamp: new Date()
        });
        
        // Update conversation last activity
        await Conversation.updateOne(
          { _id: data.conversationId },
          { lastActivity: new Date() }
        );
        
        // Populate sender info for the response
        const populatedMessage = await Message.findById(message._id)
          .populate('senderId', 'username firstName lastName profilePicture');
        
        // Broadcast to all participants in the conversation
        io.to(data.conversationId).emit('newChatMessage', {
          message: populatedMessage,
          sender: {
            id: userId,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName
          }
        });
        
      } catch (error) {
        console.error('Error sending chat message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Chat typing indicators
    socket.on('chatTyping', async (data: { conversationId: string, isTyping: boolean }) => {
      try {
        if (!data.conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        console.log(`👤 ${user.firstName} ${data.isTyping ? 'started' : 'stopped'} typing in conversation ${data.conversationId}`);
        
        // Verify user is in the conversation (security check)
        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        // Broadcast to all participants in the conversation except the sender
        socket.to(data.conversationId).emit('userChatTyping', {
          userId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          conversationId: data.conversationId,
          isTyping: data.isTyping,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error('Error handling chat typing:', error);
        socket.emit('error', { message: 'Failed to handle typing indicator' });
      }
    });

    // =============== READ RECEIPTS ===============
    
    // Mark single message as read
    socket.on('mark_message_read', async (data: { 
      conversationId: string, 
      messageId: string 
    }) => {
      try {
        const { conversationId, messageId } = data;
        
        if (!conversationId || !messageId) {
          return socket.emit('error', { message: 'Invalid read receipt data' });
        }
        
        console.log(`📖 ${user.firstName} marking message ${messageId} as read`);
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        // Verify message exists and belongs to this conversation
        const message = await Message.findOne({
          _id: messageId,
          conversationId: conversationId
        });
        
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }
        
        // Don't mark own messages as read
        if (message.senderId.toString() === userId) {
          return;
        }
        
        // Create or update read receipt
        const readReceipt = await ReadReceipt.findOneAndUpdate(
          {
            messageId: messageId,
            userId: userId
          },
          {
            conversationId: conversationId,
            readAt: new Date()
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
          }
        );
        
        // Get user details for the read receipt
        const userDetails = await User.findById(userId)
          .select('_id firstName lastName profilePicture');
        
        // Notify all participants in the conversation about the read receipt
        io.to(conversationId).emit('message_read', {
          messageId: messageId,
          readBy: {
            userId: userDetails,
            readAt: readReceipt.readAt
          },
          conversationId: conversationId
        });
        
        console.log(`✅ Message ${messageId} marked as read by ${user.firstName}`);
        
      } catch (error) {
        console.error('Error marking message as read:', error);
        socket.emit('error', { message: 'Failed to mark message as read' });
      }
    });
    
    // Mark all messages in conversation as read
    socket.on('mark_conversation_read', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        
        if (!conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        console.log(`📚 ${user.firstName} marking all messages in conversation ${conversationId} as read`);
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        // Get all unread messages in the conversation
        const unreadMessages = await Message.find({
          conversationId: conversationId,
          senderId: { $ne: userId }
        }).select('_id');
        
        if (unreadMessages.length === 0) {
          return;
        }
        
        // Get existing read receipts
        const existingReceipts = await ReadReceipt.find({
          messageId: { $in: unreadMessages.map(m => m._id) },
          userId: userId
        }).select('messageId');
        
        const existingMessageIds = new Set(existingReceipts.map(r => r.messageId.toString()));
        
        // Create read receipts for unread messages
        const newReadReceipts = unreadMessages
          .filter(msg => !existingMessageIds.has(msg._id.toString()))
          .map(msg => ({
            messageId: msg._id,
            userId: userId,
            conversationId: conversationId,
            readAt: new Date()
          }));
        
        if (newReadReceipts.length > 0) {
          await ReadReceipt.insertMany(newReadReceipts);
          
          // Get user details
          const userDetails = await User.findById(userId)
            .select('_id firstName lastName profilePicture');
          
          // Emit read events for each message
          newReadReceipts.forEach(receipt => {
            io.to(conversationId).emit('message_read', {
              messageId: receipt.messageId,
              readBy: {
                userId: userDetails,
                readAt: receipt.readAt
              },
              conversationId: conversationId
            });
          });
          
          console.log(`✅ Marked ${newReadReceipts.length} messages as read in conversation ${conversationId}`);
        }
        
      } catch (error) {
        console.error('Error marking conversation as read:', error);
        socket.emit('error', { message: 'Failed to mark conversation as read' });
      }
    });
    
    // Get read receipts for a message
    socket.on('get_message_read_receipts', async (data: { messageId: string }) => {
      try {
        const { messageId } = data;
        
        if (!messageId) {
          return socket.emit('error', { message: 'Invalid message ID' });
        }
        
        // Verify message exists and user has access
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: message.conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized' });
        }
        
        // Get read receipts with user details
        const readReceipts = await ReadReceipt.find({ messageId: messageId })
          .populate('userId', '_id firstName lastName profilePicture')
          .sort({ readAt: 1 });
        
        socket.emit('message_read_receipts', {
          messageId: messageId,
          readReceipts: readReceipts.map(r => ({
            userId: r.userId,
            readAt: r.readAt
          }))
        });
        
      } catch (error) {
        console.error('Error getting read receipts:', error);
        socket.emit('error', { message: 'Failed to get read receipts' });
      }
    });
    
    // Get unread message count for a conversation
    socket.on('get_unread_count', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        
        if (!conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': userId
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized' });
        }
        
        // Get all messages in conversation not sent by current user
        const messages = await Message.find({
          conversationId: conversationId,
          senderId: { $ne: userId }
        }).select('_id');
        
        // Get read receipts for these messages by current user
        const readReceipts = await ReadReceipt.find({
          messageId: { $in: messages.map(m => m._id) },
          userId: userId
        }).select('messageId');
        
        const readMessageIds = new Set(readReceipts.map(r => r.messageId.toString()));
        const unreadCount = messages.filter(m => !readMessageIds.has(m._id.toString())).length;
        
        socket.emit('unread_count', {
          conversationId: conversationId,
          count: unreadCount
        });
        
      } catch (error) {
        console.error('Error getting unread count:', error);
        socket.emit('error', { message: 'Failed to get unread count' });
      }
    });

    // =============== MESSAGE REACTIONS ===============
    
    socket.on('addReaction', async (data: { messageId: string, emoji: string }) => {
      try {
        const { messageId, emoji } = data;
        const userId = socket.user?._id;

        if (!userId || !messageId || !emoji) {
          return socket.emit('error', { message: 'Invalid reaction data' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }

        // Security check: Verify user is in the conversation
        const isParticipant = await Conversation.exists({
          _id: message.conversationId,
          'participants.userId': userId
        });

        if (!isParticipant) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }

        const existingReactionIndex = message.reactions.findIndex(
          r => r.userId.toString() === userId.toString()
        );

        // Case 1: User is removing their reaction by clicking the same emoji again
        if (existingReactionIndex !== -1 && message.reactions[existingReactionIndex].emoji === emoji) {
          message.reactions.splice(existingReactionIndex, 1);
          console.log(`➖ ${socket.user?.username} removed reaction ${emoji} from message ${messageId}`);
        }
        // Case 2: User is adding a new reaction or changing their existing one
        else {
          // If changing reaction, remove the old one first
          if (existingReactionIndex !== -1) {
            message.reactions.splice(existingReactionIndex, 1);
          }
          // Add the new reaction
          message.reactions.push({ userId, emoji, timestamp: new Date() });
          console.log(`➕ ${socket.user?.username} added/changed reaction to ${emoji} on message ${messageId}`);
        }

        await message.save();

        // Fetch the updated message with populated user details for reactions
        const updatedMessage = await Message.findById(messageId).populate({
          path: 'reactions.userId',
          select: '_id firstName lastName username'
        });

        if (!updatedMessage) return;

        // Broadcast a single, authoritative update event
        io.to(message.conversationId.toString()).emit('reactionUpdate', {
          messageId: message._id,
          reactions: updatedMessage.reactions.map(r => ({
            userId: (r.userId as any)._id,
            emoji: r.emoji,
            timestamp: r.timestamp,
            user: r.userId // The populated user object
          }))
        });

      } catch (error) {
        console.error('Error handling reaction:', error);
        socket.emit('error', { message: 'Failed to process reaction' });
      }
    });

    socket.on('removeReaction', async (data: { messageId: string, emoji: string }) => {
      try {
        const { messageId, emoji } = data;
        
        if (!messageId || !emoji) {
          return socket.emit('error', { message: 'Message ID and emoji are required' });
        }

        console.log(`👎 ${user.firstName} removing reaction ${emoji} from message ${messageId}`);

        // Find and verify message
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }

        // Verify user access
        const conversation = await Conversation.findOne({
          _id: message.conversationId,
          'participants.userId': userId
        });

        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }

        // Remove the user's reaction
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

        // Broadcast reaction removal
        io.to(message.conversationId.toString()).emit('reactionRemoved', {
          messageId,
          userId,
          emoji,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Error removing reaction:', error);
        socket.emit('error', { message: 'Failed to remove reaction' });
      }
    });

    socket.on('getMessageReactions', async (data: { messageId: string }) => {
      try {
        const { messageId } = data;
        
        const message = await Message.findById(messageId)
          .populate('reactions.userId', 'username firstName lastName profilePicture');
        
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }

        // Verify user access
        const conversation = await Conversation.findOne({
          _id: message.conversationId,
          'participants.userId': userId
        });

        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized' });
        }

        socket.emit('messageReactions', {
          messageId,
          reactions: message.reactions
        });

      } catch (error) {
        console.error('Error getting message reactions:', error);
        socket.emit('error', { message: 'Failed to get reactions' });
      }
    });

    // =============== ADMIN ACTIONS ===============
    
    socket.on('adminKickUser', async (data: { conversationId: string, targetUserId: string }) => {
      try {
        // Check admin permissions
        const hasPermission = await checkAdminPermission(userId, data.conversationId, 'canKickUsers');
        
        if (!hasPermission) {
          return socket.emit('error', { message: 'Insufficient permissions' });
        }
        
        // Remove user from conversation
        await Conversation.updateOne(
          { _id: data.conversationId },
          { $pull: { participants: { userId: data.targetUserId } } }
        );
        
        // Notify all participants
        io.to(data.conversationId).emit('userKicked', {
          kickedUserId: data.targetUserId,
          kickedBy: userId,
          kickedByName: `${user.firstName} ${user.lastName}`,
          timestamp: new Date()
        });
        
        // Force disconnect the kicked user from this conversation
        const kickedUserSockets = await io.in(data.targetUserId).fetchSockets();
        kickedUserSockets.forEach(kickedSocket => {
          kickedSocket.leave(data.conversationId);
        });
        
      } catch (error) {
        console.error('Error kicking user:', error);
        socket.emit('error', { message: 'Failed to kick user' });
      }
    });

    socket.on('adminDeleteMessage', async (data: { conversationId: string, messageId: string }) => {
      try {
        const hasPermission = await checkAdminPermission(userId, data.conversationId, 'canDeleteMessages');
        
        if (!hasPermission) {
          return socket.emit('error', { message: 'Insufficient permissions' });
        }
        
        // Soft delete message
        await Message.updateOne(
          { _id: data.messageId },
          { 
            isDeleted: true, 
            deletedBy: userId, 
            deletedAt: new Date() 
          }
        );
        
        io.to(data.conversationId).emit('messageDeleted', {
          messageId: data.messageId,
          deletedBy: userId,
          deletedByName: `${user.firstName} ${user.lastName}`
        });
        
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });
  });
  
  console.log('Socket.io handler initialized with read receipts');
};