// src/sockets/socket.ts
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { IUser, IAuthPayload } from '../types/user.types';
import { Conversation } from '../models/Conversation'; // Updated import
import { Message } from '../models/Message'; // Updated import

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
    
    // Real-time messaging (OLD SYSTEM - KEEPING FOR COMPATIBILITY)
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
    
    // Handle typing indicators (OLD SYSTEM - KEEPING FOR COMPATIBILITY)
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

    // =============== NEW CHAT SYSTEM ===============

    // Join conversation room
    socket.on('joinConversation', async (data: { conversationId: string }) => {
      try {
        if (!data.conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        // Verify user is a participant in this conversation
        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          'participants.userId': userId,
          'participants.isActive': true
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        socket.join(data.conversationId);
        socket.emit('joinedConversation', { conversationId: data.conversationId });
        
        console.log(`👤 ${user.username} joined conversation ${data.conversationId}`);
        
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
        console.log(`👤 ${user.username} left conversation ${data.conversationId}`);
      } catch (error) {
        console.error('Error leaving conversation:', error);
      }
    });

    socket.on('sendChatMessage', async (data: { 
      conversationId: string;
      content: string;
      messageType?: 'text' | 'image' | 'file' | 'system';
      metadata?: any;
      replyTo?: string;
    }) => {
      try {
        const { conversationId, content, messageType = 'text', metadata, replyTo } = data;
        
        if (!conversationId || !content?.trim() || !socket.user) {
          return socket.emit('error', { message: 'Invalid message data' });
        }
        
        const userId = socket.user.id;

        // Verify user is in conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': userId,
          'participants.isActive': true
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }

        // Create the message
        const message = new Message({
          conversationId,
          senderId: userId,
          content: content.trim(),
          messageType,
          metadata,
          replyTo: replyTo ? replyTo : undefined,
          readBy: [{ userId, readAt: new Date() }]
        });

        await message.save();

        // ✅ REPLACED LOGIC: Perform one atomic update for both lastMessage and unreadCount
        const otherParticipantIds = conversation.participants
          .filter(p => p.userId.toString() !== userId && p.isActive)
          .map(p => p.userId);
    
        const convBeforeUpdate = await Conversation.findById(conversationId).lean();
        console.log('--- LOG C: DOCUMENT BEFORE MESSAGE UPDATE ---', JSON.stringify(convBeforeUpdate, null, 2));
        
        await Conversation.updateOne(
          { _id: conversationId },
          {
            // Set the last message and update the timestamp
            $set: {
              lastMessage: {
                messageId: message._id,
                content: message.content,
                senderId: userId,
                sentAt: message.createdAt
              },
              updatedAt: new Date()
            },
            // Increment the unread count for all other active participants
            $inc: { 'unreadCount.$[participant].count': 1 }
          },
          {
            // This filter tells MongoDB to only apply the $inc to the other participants
            arrayFilters: [{ 'participant.userId': { $in: otherParticipantIds } }]
          }
        );
        
        const updatedConvForDebug = await Conversation.findById(conversationId).lean();
        
        const convAfterUpdate = await Conversation.findById(conversationId).lean();  
        console.log('--- LOG D: DOCUMENT AFTER MESSAGE UPDATE ---', JSON.stringify(convAfterUpdate, null, 2));        
        
        // Populate the message for broadcast
        const populatedMessage = await Message.findById(message._id)
          .populate('senderId', 'username firstName lastName profilePicture');

        // Broadcast to all participants in the conversation
        io.to(conversationId).emit('newChatMessage', {
          message: populatedMessage
        });
        
      } catch (error) {
        console.error('❌ Socket: Error handling sendChatMessage:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Chat typing indicators (UPDATED FOR NEW SYSTEM)
    socket.on('chatTyping', async (data: { conversationId: string, isTyping: boolean }) => {
      try {
        if (!data.conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        console.log(`👤 ${user.username} ${data.isTyping ? 'started' : 'stopped'} typing in conversation ${data.conversationId}`);
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: data.conversationId,
          'participants.userId': userId,
          'participants.isActive': true
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

    socket.on('toggleReaction', async (data: { messageId: string; emoji: string }) => {
      console.log('🔧 Backend: toggleReaction received:', data);
      try {
        if (!socket.user || !data.messageId || !data.emoji) return;

        const { messageId, emoji } = data;
        const userId = socket.user.id;
        
        console.log('👤 User ID:', userId, 'toggling emoji:', emoji, 'on message:', messageId);

        const message = await Message.findById(messageId);
        if (!message) {
          console.error('❌ Message not found:', messageId);
          return;
        }

        console.log('📧 Found message:', message._id, 'current reactions:', message.reactions);

        // Find if the user has already reacted with this emoji
        const reactionIndex = message.reactions.findIndex(
          (r: any) => r.userId.toString() === userId && r.emoji === emoji
        );

        if (reactionIndex > -1) {
          console.log('🗑️ Removing existing reaction');
          // If reaction exists, remove it (toggle off)
          message.reactions.splice(reactionIndex, 1);
        } else {
          console.log('➕ Adding new reaction');
          // If it doesn't exist, add it (toggle on)
          message.reactions.push({ userId, emoji });
        }

        await message.save();
        console.log('💾 Message saved with reactions:', message.reactions);

        // Broadcast the updated reactions to everyone in the conversation
        io.to(message.conversationId.toString()).emit('reactionUpdated', {
          messageId: message._id,
          reactions: message.reactions,
        });
        socket.emit('reactionUpdated', {
          messageId: message._id,
          reactions: message.reactions
        });

      console.log('📡 Broadcasted reaction update');
      
      } catch (error) {
        console.error('💥 Error toggling reaction:', error);
      }
    });

    // Mark message as read (UPDATED FOR NEW SYSTEM)
    socket.on('markMessageRead', async (data: { 
      conversationId: string, 
      messageId: string 
    }) => {
      try {
        const { conversationId, messageId } = data;
        
        if (!conversationId || !messageId) {
          return socket.emit('error', { message: 'Invalid read receipt data' });
        }
        
        console.log(`📖 ${user.username} marking message ${messageId} as read`);
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': userId,
          'participants.isActive': true
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
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
        
        // Notify all participants about the read receipt
        socket.to(conversationId).emit('messageRead', {
          messageId,
          userId,
          readAt: new Date(),
          conversationId
        });
        
        console.log(`✅ Message ${messageId} marked as read by ${user.username}`);
        
      } catch (error) {
        console.error('Error marking message as read:', error);
        socket.emit('error', { message: 'Failed to mark message as read' });
      }
    });

    // Mark conversation as read (UPDATED FOR NEW SYSTEM)
    socket.on('markConversationRead', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        
        if (!conversationId) {
          return socket.emit('error', { message: 'Invalid conversation ID' });
        }
        
        console.log(`📚 ${user.username} marking all messages in conversation ${conversationId} as read`);
        
        // Verify user is in the conversation
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.userId': userId,
          'participants.isActive': true
        });
        
        if (!conversation) {
          return socket.emit('error', { message: 'Not authorized for this conversation' });
        }
        
        // Mark all messages as read for this user
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

        // Reset unread count for this user
        await Conversation.updateOne(
          {
            _id: conversationId,
            'unreadCount.userId': userId
          },
          {
            $set: { 'unreadCount.$.count': 0 }
          }
        );
        
        // Notify conversation participants
        socket.to(conversationId).emit('conversationRead', {
          conversationId,
          userId,
          readAt: new Date()
        });
        
        console.log(`✅ All messages marked as read in conversation ${conversationId}`);
        
      } catch (error) {
        console.error('Error marking conversation as read:', error);
        socket.emit('error', { message: 'Failed to mark conversation as read' });
      }
    });
  });
  
  console.log('Socket.io handler initialized with updated chat system');
};