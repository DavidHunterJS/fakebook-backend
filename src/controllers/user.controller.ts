// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import User from '../models/User';
import Post from '../models/Post';
import Album from '../models/Photo';
import { IUser } from '../types/user.types'; // Ensure this path is correct
import s3UploadMiddleware from '../middlewares/s3-upload.middleware';

// --- IMPORT getFileUrl ---
// import uploadMiddleware from '../middlewares/upload.middleware';
// const { getFileUrl } = uploadMiddleware;

// Types for request parameters
interface UserIdParam {
  userId: string;
}

interface UsernameParam {
  username: string;
}

interface PaginationQuery {
  page?: string;
  limit?: string;
  query?: string;
}

interface InactiveUsersQuery extends PaginationQuery {
  days?: string;
}

// --- CONTROLLER FUNCTIONS ---

/**
 * @route   GET api/users
 * @desc    Search for users
 * @access  Private
 */
// export const searchUsers = async (
//   req: Request<{}, {}, {}, PaginationQuery>,
//   res: Response
// ): Promise<Response> => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const page = parseInt(req.query.page || '1');
//     const limit = parseInt(req.query.limit || '10');
//     const skip = (page - 1) * limit;
//     const searchQuery = req.query.query || '';

//     // Create query object
//     const query: any = {
//       _id: { $ne: req.user?.id }, // Exclude current user
//       isActive: true
//     };

//     // Add search parameters if query exists
//     if (searchQuery) {
//       query.$or = [
//         { username: { $regex: searchQuery, $options: 'i' } },
//         { firstName: { $regex: searchQuery, $options: 'i' } },
//         { lastName: { $regex: searchQuery, $options: 'i' } },
//         // Consider if searching email is desired/secure { email: { $regex: searchQuery, $options: 'i' } }
//       ];
//     }

//     // Exclude blocked users and users who blocked the current user
//     if (req.user) {
//       // Avoid fetching currentUser again if auth middleware already attaches it fully
//       const currentUser = req.user as IUser & mongoose.Document; // Assert type if needed
//       if (currentUser) {
//           const blockedIds = (currentUser.blockedUsers || []).map(id => new mongoose.Types.ObjectId(id.toString()));
//           query._id = {
//               $ne: new mongoose.Types.ObjectId(req.user.id),
//               $nin: blockedIds
//           };
//           // Check if other users have blocked the current user
//           query.blockedUsers = { $ne: new mongoose.Types.ObjectId(req.user.id) };
//       }
//     }


//     const users = await User.find(query)
//       .select('username firstName lastName profilePicture bio') // Ensure profilePicture is selected
//       .sort({ firstName: 1, lastName: 1 })
//       .skip(skip)
//       .limit(limit)
//       .lean(); // Use lean here

//     const total = await User.countDocuments(query);

//     return res.json({
//       users: users, // Send raw users
//       pagination: {
//         total,
//         page,
//         pages: Math.ceil(total / limit)
//       }
//     });
//   } catch (err) {
//     console.error('Error in searchUsers:', (err as Error).message);
//     return res.status(500).send('Server error');
//   }
// };

/**
 * @route   GET api/users/suggestions
 * @desc    Get friend suggestions (Consider moving to friend.controller.ts)
 * @access  Private
 */
// export const getFriendSuggestions = async (req: Request, res: Response): Promise<Response> => {
//     // NOTE: This logic might be duplicated or outdated if you have the same function
//     // in friend.controller.ts. Ensure you are modifying the correct one being used by your routes.
//     try {
//         if (!req.user) {
//             return res.status(401).json({ message: 'Not authorized' });
//         }

//         const user = await User.findById(req.user.id).lean(); // Use lean
//         if (!user) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         // Get current user's friends, requests, blocked
//         // FIX: Added explicit types to map/filter parameters
//         const currentUserFriends = (user.friends || []).map((friend: mongoose.Types.ObjectId) => friend.toString());
//         const pendingRequests = [
//             ...(user.friendRequests || []).map((request: mongoose.Types.ObjectId) => request.toString()),
//             ...(user.sentRequests || []).map((request: mongoose.Types.ObjectId) => request.toString())
//         ];
//         const blockedUsers = (user.blockedUsers || []).map((blockedUser: mongoose.Types.ObjectId) => blockedUser.toString());

//         // Find friends of friends
//         const friendsOfFriends = await User.aggregate([
//             { $match: { _id: { $in: (user.friends || []).map((id: mongoose.Types.ObjectId) => new mongoose.Types.ObjectId(id.toString())) } } },
//             { $project: { friends: 1 } },
//             { $unwind: '$friends' },
//             { $group: { _id: '$friends', commonFriends: { $sum: 1 } } },
//             { $match: {
//                 _id: {
//                     $ne: new mongoose.Types.ObjectId(req.user.id),
//                     $nin: [
//                         ...currentUserFriends,
//                         ...pendingRequests,
//                         ...blockedUsers
//                     ].map(id => new mongoose.Types.ObjectId(id)) // Ensure all are ObjectIds
//                 }
//             }},
//             { $sort: { commonFriends: -1 } },
//             { $limit: 10 },
//             { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userDetails' }},
//             { $unwind: '$userDetails' },
//             { $project: {
//                 _id: '$userDetails._id',
//                 username: '$userDetails.username',
//                 firstName: '$userDetails.firstName',
//                 lastName: '$userDetails.lastName',
//                 profilePicture: '$userDetails.profilePicture', // Select profilePicture
//                 commonFriends: 1
//             }}
//         ]);

//         let finalSuggestions = friendsOfFriends;

//         // If not enough suggestions, add random users
//         if (friendsOfFriends.length < 10) {
//             const excludeIds = [
//                 req.user.id,
//                 ...currentUserFriends,
//                 ...pendingRequests,
//                 ...blockedUsers,
//                 ...friendsOfFriends.map(fofUser => fofUser._id.toString())
//             ];

//             const randomUsers = await User.find({
//                 _id: { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) },
//                 isActive: true
//             })
//                 .select('username firstName lastName profilePicture') // Select profilePicture
//                 .limit(10 - friendsOfFriends.length)
//                 .lean(); // Use lean

//              // Combine and ensure correct structure if needed
//              finalSuggestions = [
//                 ...friendsOfFriends, // Already has the desired structure from $project
//                 ...randomUsers.map(rndUser => ({ // Map random user to match structure
//                     _id: rndUser._id,
//                     username: rndUser.username,
//                     firstName: rndUser.firstName,
//                     lastName: rndUser.lastName,
//                     profilePicture: rndUser.profilePicture,
//                     commonFriends: 0
//                 }))
//              ];
//         }


//         return res.json(finalSuggestions);

//     } catch (err) {
//         console.error('Error in getFriendSuggestions (user.controller):', (err as Error).message);
//         return res.status(500).send('Server error');
//     }
// };


/**
 * @route   GET api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
// export const getUserById = async (
//   req: Request<{ id: string }>,
//   res: Response
// ): Promise<Response> => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     if (!req.user || !req.user.id) {
//       return res.status(401).json({ message: 'Not authorized' });
//     }
//     const currentAuthUserId = req.user.id;

//     const { id: viewedUserId } = req.params;
//     if (!mongoose.Types.ObjectId.isValid(viewedUserId)) {
//       return res.status(400).json({ message: 'Invalid user ID format' });
//     }

//     const viewedUser = await User.findById(viewedUserId)
//       .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires')
//       .lean();

//     if (!viewedUser) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     const currentUser = await User.findById(currentAuthUserId)
//       .select('friends blockedUsers sentRequests friendRequests') // Ensure all needed fields are here
//       .lean();

//     if (!currentUser) {
//       return res.status(404).json({ message: 'Authenticated user not found' });
//     }

//     const isOwnProfile = viewedUser._id.toString() === currentAuthUserId;

//     // FIX: Added explicit types to .some() parameters
//     const isBlockedByCurrentUser = (currentUser.blockedUsers || []).some((blockedId: mongoose.Types.ObjectId) => blockedId.toString() === viewedUser._id.toString());
//     const currentUserIsBlockedByViewedUser = (viewedUser.blockedUsers || []).some((blockedId: mongoose.Types.ObjectId) => blockedId.toString() === currentAuthUserId);

//     if (isBlockedByCurrentUser || currentUserIsBlockedByViewedUser) {
//       return res.status(403).json({
//         message: 'User not accessible due to blocking.',
//         profile: {
//             _id: viewedUser._id,
//             username: viewedUser.username,
//             firstName: viewedUser.firstName,
//             lastName: viewedUser.lastName,
//             profilePicture: viewedUser.profilePicture, // Raw value
//             coverPhoto: viewedUser.coverPhoto,         // Raw value
//             privacyRestricted: true,
//             isBlocked: true
//         }
//       });
//     }

//     // FIX: Added explicit types to .some() parameters
//     const isFriend = (currentUser.friends || []).some((friendId: mongoose.Types.ObjectId) => friendId.toString() === viewedUser._id.toString());

//     if (!isOwnProfile &&
//         (viewedUser.privacySettings?.profileVisibility === 'private' ||
//         (viewedUser.privacySettings?.profileVisibility === 'friends' && !isFriend))) {
//       return res.json({
//             profile: {
//                 _id: viewedUser._id,
//                 username: viewedUser.username,
//                 firstName: viewedUser.firstName,
//                 lastName: viewedUser.lastName,
//                 profilePicture: viewedUser.profilePicture, // Raw value
//                 coverPhoto: viewedUser.coverPhoto,         // Raw value
//                 privacyRestricted: true
//             }
//         });
//     }

//     // FIX: Added explicit types to .some() parameters
//     const hasSentRequest = (currentUser.sentRequests || []).some((requestId: mongoose.Types.ObjectId) => requestId.toString() === viewedUser._id.toString());
//     const hasReceivedRequest = (currentUser.friendRequests || []).some((requestId: mongoose.Types.ObjectId) => requestId.toString() === viewedUser._id.toString());

//     let recentPostsData: any[] = [];
//     if (isOwnProfile ||
//         viewedUser.privacySettings?.postsVisibility === 'public' ||
//         (viewedUser.privacySettings?.postsVisibility === 'friends' && isFriend)) {
//         recentPostsData = await Post.find({ user: viewedUser._id })
//             .populate('user', 'username firstName lastName profilePicture') // Sends raw profilePicture for post author
//             .sort({ createdAt: -1 })
//             .limit(5)
//             .lean();
//     }

//     let mutualFriendsData: any[] = [];
//     if (!isOwnProfile && viewedUser.friends && currentUser.friends) {
//         // FIX: Added explicit types to .map() and .filter() parameters
//         const viewedUserFriendIds = (viewedUser.friends || []).map((friend: mongoose.Types.ObjectId) => friend.toString());
//         const currentUserFriendIds = (currentUser.friends || []).map((friend: mongoose.Types.ObjectId) => friend.toString());
//         const mutualFriendIds = viewedUserFriendIds.filter((id: string) => currentUserFriendIds.includes(id));

//         if (mutualFriendIds.length > 0) {
//             mutualFriendsData = await User.find({ _id: { $in: mutualFriendIds.map((id: string) => new mongoose.Types.ObjectId(id)) } })
//                 .select('username firstName lastName profilePicture') // Sends raw profilePicture for mutual friends
//                 .limit(6)
//                 .lean();
//         }
//     }

//     // The 'viewedUser' object contains raw S3 keys or default placeholders for image fields
//     return res.json({
//       profile: {
//         ...viewedUser,
//         friendCount: viewedUser.friends ? viewedUser.friends.length : 0,
//       },
//       relationshipStatus: { isOwnProfile, isFriend, hasSentRequest, hasReceivedRequest },
//       recentPosts: recentPostsData,
//       mutualFriends: mutualFriendsData
//     });

//   } catch (err) {
//     const error = err as Error;
//     console.error('Error in getUserById:', error.message, error.stack);
//     return res.status(500).json({ message: 'Server error', detail: error.message });
//   }
// };
/**
 * @desc    Get photo albums for a specific user
 * @route   GET /api/users/:id/albums
 */
export const getUserAlbums = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Find all albums where the 'user' field matches the user ID from the URL
    // We also populate the 'photos' field within each album to get photo details
    const albums = await Album.find({ user: req.params.id })
      .populate('photos', '_id filename caption createdAt likes comments') // Populate photos in each album
      .sort({ createdAt: -1 }); // Sort by newest first

    // Your frontend expects the response to have an `albums` key
    res.status(200).json({ albums: albums });

  } catch (error) {
    console.error('Server Error in getUserAlbums:', error);
    res.status(500).send('Server Error');
  }
};
/**
 * @desc    Get friends for a specific user
 * @route   GET /api/users/:id/friends
 */
export const getUserFriends = async (req: Request, res: Response) => {
  // Check for validation errors from the route
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.params.id)
      .populate({
        path: 'friends',
        // Select which fields of the friend objects you want to return
        select: '_id firstName lastName username profilePicture'
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Your frontend expects the response to have a `friends` key
    res.status(200).json({ friends: user.friends });

  } catch (error) {
    console.error('Server Error in getUserFriends:', error);
    res.status(500).send('Server Error');
  }
};

/**
 * @route   GET api/users/profile/:username
 * @desc    Get user profile by username
 * @access  Private
 */
// export const getUserProfile = async (
//     req: Request<UsernameParam>, // Use UsernameParam for req.params
//     res: Response
//   ): Promise<Response> => {
//     try {
//       const errors = validationResult(req); // Apply if you have validation rules for username param
//       if (!errors.isEmpty()) {
//         return res.status(400).json({ errors: errors.array() });
//       }

//       if (!req.user || !req.user.id) { // Check for authenticated user context
//         return res.status(401).json({ message: 'Not authorized' });
//       }
//       const currentAuthUserId = req.user.id;

//       const { username } = req.params;

//       const viewedUser = await User.findOne({ username })
//         // Select all necessary fields. Deselecting sensitive ones is good.
//         // profilePicture and coverPhoto should be included by default if not deselected.
//         .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires')
//         .populate<{ friends: IUser[] }>('friends', 'username firstName lastName profilePicture') // Ensure fields for friends are selected
//         .lean();

//       if (!viewedUser) {
//         return res.status(404).json({ message: 'User not found' });
//       }

//       const currentUser = await User.findById(currentAuthUserId)
//         .select('friends blockedUsers sentRequests friendRequests') // Select fields needed for relationship logic
//         .lean();

//       if (!currentUser) {
//         // This should ideally not happen if auth middleware is working
//         return res.status(404).json({ message: 'Authenticated user data not found' });
//       }

//       const isOwnProfile = viewedUser._id.toString() === currentAuthUserId;

//       // Blocking checks
//       // FIX: Added explicit types to .some() parameters
//       const isBlockedByCurrentUser = (currentUser.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.toString() === viewedUser._id.toString());
//       const currentUserIsBlockedByViewedUser = (viewedUser.blockedUsers || []).some((id: mongoose.Types.ObjectId) => id.toString() === currentAuthUserId);

//       if (isBlockedByCurrentUser || currentUserIsBlockedByViewedUser) {
//         // Return minimal info for blocked/restricted profile
//         return res.status(403).json({
//             message: 'User not accessible due to blocking.',
//             profile: {
//                 _id: viewedUser._id,
//                 username: viewedUser.username,
//                 firstName: viewedUser.firstName,
//                 lastName: viewedUser.lastName,
//                 profilePicture: viewedUser.profilePicture, // Raw S3 key or default placeholder
//                 // coverPhoto: viewedUser.coverPhoto,      // Raw S3 key or default placeholder
//                 privacyRestricted: true,
//                 isBlocked: true
//             }
//         });
//       }

//       // Relationship status
//       // FIX: Added explicit types to .some() parameters
//       const isFriend = (currentUser.friends || []).some((id: mongoose.Types.ObjectId) => id.toString() === viewedUser._id.toString());
//       const hasSentRequest = (currentUser.sentRequests || []).some((id: mongoose.Types.ObjectId) => id.toString() === viewedUser._id.toString());
//       const hasReceivedRequest = (currentUser.friendRequests || []).some((id: mongoose.Types.ObjectId) => id.toString() === viewedUser._id.toString());

//       // Privacy check for non-own profiles (applies to the full profile view)
//       if (!isOwnProfile &&
//           (viewedUser.privacySettings?.profileVisibility === 'private' ||
//           (viewedUser.privacySettings?.profileVisibility === 'friends' && !isFriend))) {
//             return res.json({
//                 profile: { // Send limited data
//                     _id: viewedUser._id,
//                     username: viewedUser.username,
//                     firstName: viewedUser.firstName,
//                     lastName: viewedUser.lastName,
//                     profilePicture: viewedUser.profilePicture, // Raw value
//                     coverPhoto: viewedUser.coverPhoto,         // Raw value
//                     privacyRestricted: true
//                 }
//             });
//       }

//       // Get recent posts (respecting privacy)
//       let recentPostsData: any[] = [];
//       if (isOwnProfile ||
//           viewedUser.privacySettings?.postsVisibility === 'public' ||
//           (viewedUser.privacySettings?.postsVisibility === 'friends' && isFriend)) {
//           recentPostsData = await Post.find({ user: viewedUser._id })
//             // Ensure populated user within post also sends raw profilePicture
//             .populate('user', 'username firstName lastName profilePicture')
//             .sort({ createdAt: -1 })
//             .limit(5)
//             .lean();
//       }

//       // Get mutual friends
//       let mutualFriendsData: any[] = [];
//       if (!isOwnProfile && viewedUser.friends && currentUser.friends) {
//         // FIX: Kept 'any' type from your comment, but added explicit type to filter
//         const viewedUserFriendIds = (viewedUser.friends || []).map((friend: any) => { // Use 'any' or proper populated type
//             if (friend && typeof friend === 'object' && friend._id) return friend._id.toString();
//             if (typeof friend === 'string') return friend;
//             if (friend && typeof friend.toString === 'function') return friend.toString(); // For ObjectId instances
//             return null;
//         }).filter((id: string | null) => id !== null) as string[];

//         // FIX: Added explicit types to .map() and .filter()
//         const currentUserFriendIds = (currentUser.friends || []).map((friend: mongoose.Types.ObjectId) => friend.toString());
//         const mutualFriendIds = viewedUserFriendIds.filter((id: string) => currentUserFriendIds.includes(id));

//         if (mutualFriendIds.length > 0) {
//             mutualFriendsData = await User.find({ _id: { $in: mutualFriendIds.map((id: string) => new mongoose.Types.ObjectId(id)) }})
//                 // Ensure populated mutual friends also send raw profilePicture
//                 .select('username firstName lastName profilePicture')
//                 .limit(6)
//                 .lean();
//         }
//       }

//       // Structure the response with raw data
//       // The 'viewedUser' (from .lean()) contains raw S3 keys or default placeholders
//       // for profilePicture and coverPhoto.
//       return res.json({
//         profile: {
//             ...viewedUser, // Spreads all fields from the lean viewedUser object
//             friendCount: viewedUser.friends ? viewedUser.friends.length : 0,
//         },
//         relationshipStatus: { isOwnProfile, isFriend, hasSentRequest, hasReceivedRequest },
//         // recentPostsData already contains posts with raw user.profilePicture (due to populate + lean)
//         recentPosts: recentPostsData,
//         // mutualFriendsData already contains users with raw profilePicture (due to select + lean)
//         mutualFriends: mutualFriendsData
//       });

//     } catch (err) {
//       console.error('Error in getUserProfile:', (err as Error).message, (err as Error).stack);
//       return res.status(500).send('Server error');
//     }
// };

/**
 * @route   PUT api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
// export const updateProfile = async (req: Request, res: Response): Promise<Response> => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     // It's good practice to also check req.user.id if your types don't guarantee it
//     if (!req.user || !req.user.id) {
//       return res.status(401).json({ message: 'Not authorized' });
//     }
//     const userId = req.user.id; // Use consistently

//     console.log("Update profile called for user:", userId);
//     console.log("Request body:", req.body);

//     const { firstName, lastName, bio, location, birthday } = req.body;

//     const updateFields: Partial<IUser> = {};
//     if (firstName !== undefined) updateFields.firstName = firstName;
//     if (lastName !== undefined) updateFields.lastName = lastName;
//     if (bio !== undefined) updateFields.bio = bio;
//     if (location !== undefined) updateFields.location = location;
//     if (birthday) {
//         try {
//             const parsedDate = new Date(birthday);
//             // Check if date is valid
//             if (!isNaN(parsedDate.getTime())) {
//                 updateFields.birthday = parsedDate;
//             } else {
//                 console.warn("Invalid birthday date received:", birthday, "- not updating field.");
//                 // Optionally, you could return a 400 error here if birthday format is strict
//                 // return res.status(400).json({ message: 'Invalid birthday format' });
//             }
//         } catch (dateError) {
//             console.warn("Error parsing birthday date:", birthday, dateError);
//         }
//     }

//     console.log("Fields to update:", updateFields);

//     // Check if update object is empty (no actual data fields were provided or valid)
//     if (Object.keys(updateFields).length === 0) {
//       console.log("Warning: No valid fields to update. Returning current user data.");
//       const currentUser = await User.findById(userId)
//         .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires')
//         .lean(); // Use lean to get a plain object

//       if (!currentUser) {
//         // This case should be rare if the user is authenticated
//         return res.status(404).json({ message: 'User not found' });
//       }
//       return res.json(currentUser); // <<< CORRECTED: Send raw currentUser data
//     }

//     const updatedUser = await User.findByIdAndUpdate(
//       userId, // Use consistent userId variable
//       { $set: updateFields },
//       { new: true, runValidators: true }
//     )
//     .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires')
//     .lean(); // Use lean for plain JS object

//     console.log("DB operation result (updatedUser):", updatedUser ? updatedUser._id : 'null');

//     if (!updatedUser) {
//       console.log("User not found after update attempt");
//       return res.status(404).json({ message: 'User not found during update' });
//     }

//     return res.json(updatedUser); // <<< CORRECTED: Send raw updatedUser data

//   // FIX: Replaced 'catch (err: any)' with 'catch (err: unknown)' and added type guards
//   } catch (err: unknown) {
//     console.error("Error updating profile:", err); // Log the full error object

//     // Type guard for Mongoose Validation Error
//     if (
//         typeof err === 'object' &&
//         err !== null &&
//         'name' in err &&
//         err.name === 'ValidationError' &&
//         'errors' in err
//     ) {
//         // We can safely cast to any here just to extract errors
//         return res.status(400).json({ 
//             message: "Validation failed", 
//             errors: (err as { errors: unknown }).errors 
//         });
//     }

//     // Type guard for general Error
//     if (err instanceof Error) {
//         console.error("Error updating profile stack:", err.stack); // Log stack
//         return res.status(500).json({ message: 'Server error', detail: err.message });
//     }

//     // Fallback
//     return res.status(500).json({ message: 'An unknown server error occurred' });
//   }
// };

// export const uploadProfilePicture = async (req: Request, res: Response): Promise<Response> => {
//   console.log('--- [Controller] uploadProfilePicture: Entered ---');

//   if (!req.user || !(req.user as any).id) {
//     console.error('[Controller] uploadProfilePicture: Error - User not authenticated or ID missing from req.user.');
//     return res.status(401).json({ message: 'Not authorized. User ID missing.' });
//   }
//   const userId = (req.user as any).id;

//   if (!req.file) {
//     console.error('[Controller] uploadProfilePicture: Error - No file uploaded.');
//     return res.status(400).json({ message: 'No file uploaded. Please select an image.' });
//   }

//   // When using multer-s3, file.key contains the S3 object key
//   // file.location contains the full S3 URL
//   // If S3_BUCKET_NAME is not set, your middleware falls back to local,
//   // in which case req.file.filename would be used by the s3UploadMiddleware.deleteFile's local path.
//   // We should primarily rely on the 'key' provided by multer-s3 or the filename for local.
//   // Your s3UploadMiddleware.deleteFile and getFileUrl handle the conditional logic.

//   const newFileIdentifier = (req.file as any).key || req.file.filename; // S3 key or local filename

//   console.log(`[Controller] uploadProfilePicture: File received for user ${userId}. Identifier: ${newFileIdentifier}`);

//   try {
//     const userToUpdate = await User.findById(userId);

//     if (!userToUpdate) {
//       console.error(`[Controller] uploadProfilePicture: Error - User not found with ID: ${userId}`);
//       // If user not found, the uploaded file is orphaned, attempt to delete it.
//       // s3UploadMiddleware.deleteFile will handle if it's S3 or local
//       await s3UploadMiddleware.deleteFile(newFileIdentifier);
//       console.log(`[Controller] uploadProfilePicture: Cleaned up orphaned file: ${newFileIdentifier}`);
//       return res.status(404).json({ message: 'User not found' });
//     }

//     const oldProfilePictureIdentifier = userToUpdate.profilePicture;

//     // Update user's profilePicture field with the new S3 key or local filename
//     userToUpdate.profilePicture = newFileIdentifier;
//     await userToUpdate.save();
//     console.log(`[Controller] uploadProfilePicture: User ${userToUpdate.username} profile picture updated in DB to: ${userToUpdate.profilePicture}`);

//     // If there was an old profile picture and it wasn't a default, delete it
//     if (oldProfilePictureIdentifier && oldProfilePictureIdentifier !== 'default-avatar.png') {
//       console.log(`[Controller] uploadProfilePicture: Attempting to delete old profile picture: ${oldProfilePictureIdentifier}`);
//       const deleteSuccess = await s3UploadMiddleware.deleteFile(oldProfilePictureIdentifier);
//       if (deleteSuccess) {
//         console.log(`[Controller] uploadProfilePicture: Successfully deleted old profile picture: ${oldProfilePictureIdentifier}`);
//       } else {
//         console.warn(`[Controller] uploadProfilePicture: Failed or old profile picture not found for deletion: ${oldProfilePictureIdentifier}`);
//       }
//     }

//     // Construct the full URL for the newly uploaded profile picture using your middleware's helper
//     const newProfilePictureUrl = s3UploadMiddleware.getFileUrl(userToUpdate.profilePicture);

//     return res.status(200).json({
//       message: 'Profile picture updated successfully',
//       profilePicture: userToUpdate.profilePicture, // The S3 key or local filename
//       profilePictureUrl: newProfilePictureUrl     // The full URL for frontend use
//     });

//   } catch (error: unknown) {
//     const err = error as Error;
//     console.error('[Controller] uploadProfilePicture: Server error during profile picture upload:', err.message, err.stack);

//     // If an error occurs after file upload but before DB save, try to delete the uploaded file
//     if (req.file) {
//       // newFileIdentifier holds the key/filename from the current upload attempt
//       await s3UploadMiddleware.deleteFile(newFileIdentifier);
//       console.log(`[Controller] uploadProfilePicture: Cleaned up file ${newFileIdentifier} after error.`);
//     }
//     return res.status(500).json({ message: 'Server error during profile picture upload.' });
//   }
// };

/**
 * @route   POST api/users/profile/cover // Or api/profile/cover based on your routes
 * @desc    Upload cover photo
 * @access  Private
 */
// export const uploadCoverPhoto = async (req: Request, res: Response): Promise<Response> => {
//   console.log('--- [Controller] uploadCoverPhoto: Entered ---');

//   if (!req.user || !(req.user as any).id) {
//     console.error('[Controller] uploadCoverPhoto: Error - User not authenticated or ID missing.');
//     return res.status(401).json({ message: 'Not authorized. User ID missing.' });
//   }
//   const userId = (req.user as any).id;

//   if (!req.file) {
//     console.error('[Controller] uploadCoverPhoto: Error - No file uploaded.');
//     return res.status(400).json({ message: 'No file uploaded. Please select an image.' });
//   }

//   const newFileIdentifier = (req as any).s3Key || req.file.filename;

//   try {
//     const userToUpdate = await User.findById(userId);

//     if (!userToUpdate) {
//       console.error(`[Controller] uploadCoverPhoto: Error - User not found with ID: ${userId}`);
//       await s3UploadMiddleware.deleteFile(newFileIdentifier);
//       return res.status(404).json({ message: 'User not found' });
//     }
//     const oldCoverPhotoIdentifier = userToUpdate.coverPhoto;

//     // Update user's coverPhoto field
//     userToUpdate.coverPhoto = newFileIdentifier;
    
//     const savedUser = await userToUpdate.save();

//     // Verify the save worked by refetching
//     const verifyUser = await User.findById(userId);

//     // Clean up old file
//     if (oldCoverPhotoIdentifier && oldCoverPhotoIdentifier !== 'default-cover.png') {
//       await s3UploadMiddleware.deleteFile(oldCoverPhotoIdentifier);
//     }

//     const responseObj = {
//       message: 'Cover photo updated successfully',
//       coverPhoto: savedUser.coverPhoto,
//     };

//     return res.status(200).json(responseObj);

//   } catch (error: unknown) {
//     const err = error as Error;
//     console.error('[Controller] uploadCoverPhoto: Server error:', err.message, err.stack);
    
//     if (req.file) {
//       await s3UploadMiddleware.deleteFile(newFileIdentifier);
//     }
//     return res.status(500).json({ message: 'Server error during cover photo upload.' });
//   }
// };

/**coverPhotoUrl
 * @route   GET api/users/friends
 * @desc    Get user's friends
 * @access  Private
 */
// export const getFriends = async (req: Request, res: Response): Promise<Response> => {
//   try {
//     if (!req.user || !req.user.id) { // Added check for req.user.id for robustness
//       return res.status(401).json({ message: 'Not authorized' });
//     }

//     const userWithFriends = await User.findById(req.user.id)
//       // Populate the 'friends' field and select specific fields for each friend,
//       // including the raw 'profilePicture'.
//       .populate<{ friends: any[] }>('friends', 'username firstName lastName profilePicture isOnline lastActive') // Use any[] or a more specific IUser[] type
//       .select('friends') // Only select the friends array from the main user document
//       .lean(); // Get plain JavaScript objects

//     if (!userWithFriends || !userWithFriends.friends || userWithFriends.friends.length === 0) {
//       return res.json([]); // Return empty array if no user, no friends array, or no friends
//     }

//     // The userWithFriends.friends array now contains plain JavaScript objects
//     // where each friend's profilePicture is the raw S3 key or default placeholder string.
//     // No transformation is needed here by the backend.

//     return res.json(userWithFriends.friends); // <<< CORRECTED: Send the raw populated friends array

//   } catch (err) {
//     const error = err as Error; // Cast for better error object access
//     console.error('Error in getFriends:', error.message, error.stack); // Added .stack
//     return res.status(500).json({ message: 'Server error' }); // Changed to .json for consistency
//   }
// };


// /**
//  * @route   GET api/users/friend-requests
//  * @desc    Get user's friend requests (received)
//  * @access  Private
//  */
// export const getFriendRequests = async (req: Request, res: Response): Promise<Response> => {
//   try {
//     if (!req.user || !req.user.id) { // Added check for req.user.id
//       return res.status(401).json({ message: 'Not authorized' });
//     }

//     const userWithRequests = await User.findById(req.user.id)
//       // Populate the 'friendRequests' field, selecting necessary details for each requesting user,
//       // including their raw 'profilePicture'.
//       .populate<{ friendRequests: any[] }>('friendRequests', 'username firstName lastName profilePicture') // Use any[] or IUser[]
//       .select('friendRequests') // Only select the friendRequests array from the main user doc
//       .lean(); // Get plain JavaScript objects

//     if (!userWithRequests || !userWithRequests.friendRequests || userWithRequests.friendRequests.length === 0) {
//       return res.json([]); // Return empty array if no user, no friendRequests array, or no requests
//     }

//     // The userWithRequests.friendRequests array now contains plain JavaScript objects
//     // where each requesting user's profilePicture is the raw S3 key or default placeholder string.
//     // No transformation by the backend is needed here.

//     return res.json(userWithRequests.friendRequests); // <<< CORRECTED: Return the actual data

//   } catch (err) {
//     const error = err as Error; // Cast for better error object access
//     console.error('Error in getFriendRequests:', error.message, error.stack); // Added .stack for more debug info
//     return res.status(500).json({ message: 'Server error' }); // Changed to .json for consistency
//   }
// };


// // --- FRIEND MANAGEMENT (send, accept, reject, remove, block, unblock) ---
// // These typically don't return full user objects in the response,
// // so transformation might not be needed unless you change their return values.
// // Review each one if you intend to return user data from them.
// export const sendFriendRequest = async ( /* ... */ ) => { /* ... */ };
// export const acceptFriendRequest = async ( /* ... */ ) => { /* ... */ };
// export const rejectFriendRequest = async ( /* ... */ ) => { /* ... */ };
// export const removeFriend = async ( /* ... */ ) => { /* ... */ };
// export const blockUser = async ( /* ... */ ) => { /* ... */ };
// export const unblockUser = async ( /* ... */ ) => { /* ... */ };
// // ---------------------------------------------------------------------


// /**
//  * @route   GET api/users/blocked
//  * @desc    Get blocked users
//  * @access  Private
//  */
// export const getBlockedUsers = async (req: Request, res: Response): Promise<Response> => {
//   try {
//     if (!req.user || !req.user.id) { // Added check for req.user.id for completeness
//       return res.status(401).json({ message: 'Not authorized' });
//     }

//     const user = await User.findById(req.user.id)
//       .populate<{ blockedUsers: any[] }>('blockedUsers', 'username firstName lastName profilePicture') // Explicitly type populated field
//       .select('blockedUsers')
//       .lean();

//     if (!user || !user.blockedUsers) {
//       return res.json([]); // Return empty array if no user or no blockedUsers array
//     }

//     // The user.blockedUsers array now contains plain JavaScript objects
//     // with profilePicture as the raw S3 key or default placeholder string.
//     // No transformation is needed here.

//     return res.json(user.blockedUsers); // <<< CORRECTED: Return the actual data

//   } catch (err) {
//     console.error('Error in getBlockedUsers:', (err as Error).message, (err as Error).stack); // Added stack for more debug info
//     return res.status(500).json({ message: 'Server error' }); // Changed to .json for consistency
//   }
// };


// /**
//  * @route   GET api/users/online-friends
//  * @desc    Get online friends
//  * @access  Private
//  */
// export const getOnlineFriends = async (req: Request, res: Response): Promise<Response> => {
//   try {
//     if (!req.user) return res.status(401).json({ message: 'Not authorized' });

//     const user = await User.findById(req.user.id).select('friends').lean(); // Only need friend IDs
//     if (!user || !user.friends) return res.json([]);

//     const onlineFriends = await User.find({
//       _id: { $in: user.friends }, // Find users whose IDs are in the friends list
//       isOnline: true // Filter by online status
//     }).select('username firstName lastName profilePicture lastActive') // Select fields
//       .lean();


//     return res.json(onlineFriends);

//   } catch (err) {
//     console.error('Error in getOnlineFriends:', (err as Error).message);
//     return res.status(500).send('Server error');
//   }
// };


// /**
//  * @route   PUT api/users/privacy-settings
//  * @desc    Update privacy settings
//  * @access  Private
//  */

// export const updatePrivacySettings = async (req: Request, res: Response): Promise<Response> => {
//   try {
//     // Optional: Add validation for the request body if you have express-validator rules
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     if (!req.user) { // req.user should be set by your auth middleware
//       return res.status(401).json({ message: 'Not authorized' });
//     }

//     const { profileVisibility, friendsVisibility, postsVisibility } = req.body;

//     // --- FETCH THE USER DOCUMENT FROM THE DATABASE ---
//     const userToUpdate = await User.findById(req.user.id);
//     // ------------------------------------------------

//     if (!userToUpdate) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     // Initialize privacySettings object if it doesn't exist on the document
//     if (!userToUpdate.privacySettings) {
//       userToUpdate.privacySettings = {
//         profileVisibility: 'public', // Set your desired defaults
//         friendsVisibility: 'public',
//         postsVisibility: 'public'
//       };
//     }

//     // Apply updates from req.body if they are provided
//     // Check for undefined to allow explicit setting to empty string or valid enum values
//     if (profileVisibility !== undefined) {
//       userToUpdate.privacySettings.profileVisibility = profileVisibility;
//     }
//     if (friendsVisibility !== undefined) {
//       userToUpdate.privacySettings.friendsVisibility = friendsVisibility;
//     }
//     if (postsVisibility !== undefined) {
//       userToUpdate.privacySettings.postsVisibility = postsVisibility;
//     }

//     // Save the changes to the user document
//     await userToUpdate.save(); // Now 'userToUpdate' is defined and is a Mongoose document

//     return res.json({
//       message: 'Privacy settings updated',
//       privacySettings: userToUpdate.privacySettings // Return the updated settings
//     });

//   } catch (err) {
//     console.error('Error in updatePrivacySettings:', (err as Error).message);
//     return res.status(500).send('Server error');
//   }
// };


// --- ADMIN FUNCTIONS (getInactiveUsers, reportUser, getReportedUsers) ---
// These likely don't need image transformation unless the admin UI displays avatars.
// Review their .select() statements and return values if needed.
export const getInactiveUsers = async ( /* ... */ ) => { /* ... */ };
export const reportUser = async ( /* ... */ ) => { /* ... */ };
export const getReportedUsers = async ( /* ... */ ) => { /* ... */ };
// ------------------------------------------------------------------