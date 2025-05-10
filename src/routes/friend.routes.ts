// src/routes/friend.routes.ts
import express from 'express';
import  auth  from '../middlewares/auth.middleware';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  unfriendUser,
  blockUser,
  unblockUser,
  getFriends,
  getPendingRequests,
  getSentRequests,
  getBlockedUsers,
  getFriendshipStatus,
  getMutualFriends,
  getFriendSuggestions,
  getActiveFriends
} from '../controllers/friend.controller';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Friend management
router.post('/request/:userId', sendFriendRequest);
router.put('/accept/:userId', acceptFriendRequest);
router.put('/decline/:userId', declineFriendRequest);
router.delete('/cancel/:userId', cancelFriendRequest);
router.delete('/:userId', unfriendUser);

// Blocking
router.put('/block/:userId', blockUser);
router.put('/unblock/:userId', unblockUser);

// Lists and status
router.get('/', getFriends);
router.get('/requests/pending', getPendingRequests);
router.get('/requests/sent', getSentRequests);
router.get('/blocked', getBlockedUsers);
router.get('/status/:userId', getFriendshipStatus);
router.get('/mutual/:userId', getMutualFriends);
router.get('/suggestions', getFriendSuggestions);
router.get('/active', getActiveFriends);

export default router;