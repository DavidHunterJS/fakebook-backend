// src/sockets/socket.ts
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { IUser, IAuthPayload } from '../types/user.types';

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
  });
  
  console.log('Socket.io handler initialized');
};