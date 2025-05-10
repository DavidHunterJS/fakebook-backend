// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import mongoose, {FlattenMaps} from 'mongoose';
import { validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';
import User from '../models/User';
import Post from '../models/Post';
import { IUser } from '../types/user.types'; // Ensure this path is correct

// --- IMPORT getFileUrl ---
import uploadMiddleware from '../middlewares/upload.middleware';
const { getFileUrl } = uploadMiddleware;

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

// --- ADD TRANSFORMATION HELPER ---
// Takes a user object (Mongoose doc or lean object) and returns a plain object
// with profilePicture and coverPhoto fields converted to full URLs.

const transformUserImageUrls = (user: any): any => {
  // If user is null, undefined, or just a string (ID), we can't transform image URLs from it.
  // Return it as is, or handle as appropriate for your logic.
  if (!user || typeof user === 'string') {
    return user;
  }

  const userData = typeof user.toObject === 'function' ? user.toObject() : { ...user };

  return {
    ...userData,
    profilePicture: getFileUrl(userData.profilePicture, 'profile'),
    coverPhoto: getFileUrl(userData.coverPhoto, 'cover'),
  };
};

// --- CONTROLLER FUNCTIONS ---

/**
 * @route   GET api/users
 * @desc    Search for users
 * @access  Private
 */
export const searchUsers = async (
  req: Request<{}, {}, {}, PaginationQuery>,
  res: Response
): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '10');
    const skip = (page - 1) * limit;
    const searchQuery = req.query.query || '';

    // Create query object
    const query: any = {
      _id: { $ne: req.user?.id }, // Exclude current user
      isActive: true
    };

    // Add search parameters if query exists
    if (searchQuery) {
      query.$or = [
        { username: { $regex: searchQuery, $options: 'i' } },
        { firstName: { $regex: searchQuery, $options: 'i' } },
        { lastName: { $regex: searchQuery, $options: 'i' } },
        // Consider if searching email is desired/secure { email: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    // Exclude blocked users and users who blocked the current user
    if (req.user) {
      // Avoid fetching currentUser again if auth middleware already attaches it fully
      const currentUser = req.user as IUser & mongoose.Document; // Assert type if needed
      if (currentUser) {
          const blockedIds = (currentUser.blockedUsers || []).map(id => new mongoose.Types.ObjectId(id.toString()));
          query._id = {
              $ne: new mongoose.Types.ObjectId(req.user.id),
              $nin: blockedIds
          };
          // Check if other users have blocked the current user
          query.blockedUsers = { $ne: new mongoose.Types.ObjectId(req.user.id) };
      }
    }


    const users = await User.find(query)
      .select('username firstName lastName profilePicture bio') // Ensure profilePicture is selected
      .sort({ firstName: 1, lastName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean here

    const total = await User.countDocuments(query);

    // --- Transform image URLs before sending ---
    const transformedUsers = users.map(transformUserImageUrls);
    // -----------------------------------------

    return res.json({
      users: transformedUsers, // Send transformed users
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error in searchUsers:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};

/**
 * @route   GET api/users/suggestions
 * @desc    Get friend suggestions (Consider moving to friend.controller.ts)
 * @access  Private
 */
export const getFriendSuggestions = async (req: Request, res: Response): Promise<Response> => {
    // NOTE: This logic might be duplicated or outdated if you have the same function
    // in friend.controller.ts. Ensure you are modifying the correct one being used by your routes.
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const user = await User.findById(req.user.id).lean(); // Use lean
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get current user's friends, requests, blocked
        const currentUserFriends = (user.friends || []).map(friend => friend.toString());
        const pendingRequests = [
            ...(user.friendRequests || []).map(request => request.toString()),
            ...(user.sentRequests || []).map(request => request.toString())
        ];
        const blockedUsers = (user.blockedUsers || []).map(blockedUser => blockedUser.toString());

        // Find friends of friends
        const friendsOfFriends = await User.aggregate([
            { $match: { _id: { $in: (user.friends || []).map(id => new mongoose.Types.ObjectId(id.toString())) } } },
            { $project: { friends: 1 } },
            { $unwind: '$friends' },
            { $group: { _id: '$friends', commonFriends: { $sum: 1 } } },
            { $match: {
                _id: {
                    $ne: new mongoose.Types.ObjectId(req.user.id),
                    $nin: [
                        ...currentUserFriends,
                        ...pendingRequests,
                        ...blockedUsers
                    ].map(id => new mongoose.Types.ObjectId(id)) // Ensure all are ObjectIds
                }
            }},
            { $sort: { commonFriends: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userDetails' }},
            { $unwind: '$userDetails' },
            { $project: {
                _id: '$userDetails._id',
                username: '$userDetails.username',
                firstName: '$userDetails.firstName',
                lastName: '$userDetails.lastName',
                profilePicture: '$userDetails.profilePicture', // Select profilePicture
                commonFriends: 1
            }}
        ]);

        let finalSuggestions = friendsOfFriends;

        // If not enough suggestions, add random users
        if (friendsOfFriends.length < 10) {
            const excludeIds = [
                req.user.id,
                ...currentUserFriends,
                ...pendingRequests,
                ...blockedUsers,
                ...friendsOfFriends.map(fofUser => fofUser._id.toString())
            ];

            const randomUsers = await User.find({
                _id: { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) },
                isActive: true
            })
                .select('username firstName lastName profilePicture') // Select profilePicture
                .limit(10 - friendsOfFriends.length)
                .lean(); // Use lean

             // Combine and ensure correct structure if needed
             finalSuggestions = [
                ...friendsOfFriends, // Already has the desired structure from $project
                ...randomUsers.map(rndUser => ({ // Map random user to match structure
                    _id: rndUser._id,
                    username: rndUser.username,
                    firstName: rndUser.firstName,
                    lastName: rndUser.lastName,
                    profilePicture: rndUser.profilePicture,
                    commonFriends: 0
                }))
             ];
        }

        // --- Transform image URLs before sending ---
        const transformedSuggestions = finalSuggestions.map(transformUserImageUrls);
        // -----------------------------------------

        return res.json(transformedSuggestions);

    } catch (err) {
        console.error('Error in getFriendSuggestions (user.controller):', (err as Error).message);
        return res.status(500).send('Server error');
    }
};


/**
 * @route   GET api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
export const getUserById = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> => {
  try {
    // ... (validation, auth check) ...

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user ID format' });

    const user = await User.findById(id)
      // Select all fields needed, including image fields and privacy settings
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check blocking status requires fetching current user
    const currentUser = await User.findById(req.user!.id).select('friends blockedUsers sentRequests friendRequests').lean(); // Fetch only needed fields
    if (!currentUser) return res.status(404).json({ message: 'Current user not found' });


    const isOwnProfile = user._id.toString() === req.user!.id;

    // Check blocking
    const isBlockedByCurrentUser = (currentUser.blockedUsers || []).some(blockedId => blockedId.toString() === user._id.toString());
    const currentUserIsBlocked = (user.blockedUsers || []).some(blockedId => blockedId.toString() === req.user!.id);

    if (isBlockedByCurrentUser || currentUserIsBlocked) {
      return res.status(403).json({ message: 'User not accessible' });
    }

    // Check privacy
    const isFriend = (currentUser.friends || []).some(friendId => friendId.toString() === user._id.toString());

    if (!isOwnProfile &&
        (user.privacySettings?.profileVisibility === 'private' ||
        (user.privacySettings?.profileVisibility === 'friends' && !isFriend))) {
       // --- Transform limited data ---
       return res.json(transformUserImageUrls({
            _id: user._id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePicture: user.profilePicture, // Pass filename
            privacyRestricted: true
        }));
       // ----------------------------
    }

    // Determine relationship status
     const hasSentRequest = (currentUser.sentRequests || []).some(requestId => requestId.toString() === user._id.toString());
     const hasReceivedRequest = (currentUser.friendRequests || []).some(requestId => requestId.toString() === user._id.toString());

    // Get recent posts (respecting privacy)
    let recentPostsData: any[] = [];
    if (isOwnProfile ||
        user.privacySettings?.postsVisibility === 'public' ||
        (user.privacySettings?.postsVisibility === 'friends' && isFriend)) {
        recentPostsData = await Post.find({ user: user._id })
            .populate('user', 'username firstName lastName profilePicture') // Select profilePicture here too
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(); // Use lean
    }

    // Get mutual friends
    let mutualFriendsData: any[] = [];
    if (!isOwnProfile && user.friends && currentUser.friends) {
        const userFriendIds = user.friends.map(friend => friend.toString());
        const currentUserFriendIds = currentUser.friends.map(friend => friend.toString());
        const mutualFriendIds = userFriendIds.filter(id => currentUserFriendIds.includes(id));

        if (mutualFriendIds.length > 0) {
            mutualFriendsData = await User.find({ _id: { $in: mutualFriendIds.map(id => new mongoose.Types.ObjectId(id)) } })
                .select('username firstName lastName profilePicture') // Select profilePicture
                .limit(6)
                .lean(); // Use lean
        }
    }

    // --- Transform all image URLs before sending ---
    const transformedUser = transformUserImageUrls(user);
    const transformedMutualFriends = mutualFriendsData.map(transformUserImageUrls);
    const transformedRecentPosts = recentPostsData.map(post => ({
        ...post,
        // Handle posts where user might be null or already an object from populate
        user: post.user ? transformUserImageUrls(post.user) : null
    }));
    // -------------------------------------------

    return res.json({
      ...transformedUser,
      relationshipStatus: { isOwnProfile, isFriend, hasSentRequest, hasReceivedRequest },
      friendCount: user.friends ? user.friends.length : 0, // Use original user count
      recentPosts: transformedRecentPosts,
      mutualFriends: transformedMutualFriends
    });

  } catch (err) {
    console.error('Error in getUserById:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};


/**
 * @route   GET api/users/profile/:username
 * @desc    Get user profile by username
 * @access  Private
 */
export const getUserProfile = async (
    req: Request<UsernameParam>,
    res: Response
  ): Promise<Response> => {
    try {
      // ... (validation, auth check) ...
      const { username } = req.params;

      const user = await User.findOne({ username })
        .select('-password ...') // Select necessary fields including profilePicture, coverPhoto
        .populate('friends', 'username firstName lastName profilePicture') // Select profilePicture here too
        .lean(); // Use lean

      if (!user) return res.status(404).json({ message: 'User not found' });

      // Fetch current user for checks
      const currentUser = await User.findById(req.user!.id).select('friends blockedUsers sentRequests friendRequests').lean();
      if (!currentUser) return res.status(404).json({ message: 'Current user not found' });

      const isOwnProfile = user._id.toString() === req.user!.id;

      // Blocking checks...
      const isBlockedByCurrentUser = (currentUser.blockedUsers || []).some(id => id.toString() === user._id.toString());
      const currentUserIsBlocked = (user.blockedUsers || []).some(id => id.toString() === req.user!.id);
      if (isBlockedByCurrentUser || currentUserIsBlocked) return res.status(403).json({ message: 'User not accessible' });

      // Relationship status...
      const isFriend = (currentUser.friends || []).some(id => id.toString() === user._id.toString());
      const hasSentRequest = (currentUser.sentRequests || []).some(id => id.toString() === user._id.toString());
      const hasReceivedRequest = (currentUser.friendRequests || []).some(id => id.toString() === user._id.toString());

       // Get recent posts (respecting privacy) - reuse logic from getUserById if possible
       let recentPostsData: any[] = [];
       // ... (fetch posts logic, ensuring user is populated with profilePicture) ...
       recentPostsData = await Post.find({ user: user._id })
         .populate('user', 'username firstName lastName profilePicture')
         .sort({ createdAt: -1 })
         .limit(5)
         .lean();


      // Get mutual friends - reuse logic from getUserById if possible
      let mutualFriendsData: any[] = [];
      // ... (fetch mutual friends logic, ensuring profilePicture is selected) ...
      if (!isOwnProfile && user.friends && currentUser.friends) {
        const userFriendIds = (user.friends || []).map((friend: string | FlattenMaps<IUser> | null | undefined) => { // Added null/undefined for safety
          if (friend && typeof friend === 'object' && friend._id) {
            // It's a populated user object (FlattenMaps<IUser>)
            return friend._id.toString();
          }
          if (typeof friend === 'string') {
            // It's already a string ID
            return friend;
          }
          // Handle cases where friend might be an ObjectId instance (if .lean() wasn't used or populate was partial)
          // or if friend is null/undefined after a failed populate.
          if (friend && typeof friend.toString === 'function') {
              // This might catch ObjectId instances if they weren't stringified by .lean()
              // For safety, ensure it's not trying to call toString on the object itself if it's already handled.
              // This condition is a bit tricky if `friend` is an object without `_id` but has `toString`.
              // Usually, for your case, the first two `if` statements are the most relevant.
              return friend.toString();
          }
          return null; // Or some other way to handle unexpected/null items
        }).filter(id => id !== null) as string[]; // Filter out any nulls and assert the type
          const currentUserFriendIds = currentUser.friends.map(friend => friend.toString());
          const mutualFriendIds = userFriendIds.filter(id => currentUserFriendIds.includes(id));
          if (mutualFriendIds.length > 0) {
              mutualFriendsData = await User.find({ _id: { $in: mutualFriendIds.map(id => new mongoose.Types.ObjectId(id)) }})
                  .select('username firstName lastName profilePicture')
                  .limit(6)
                  .lean();
          }
      }

      // --- Transform images ---
      const transformedProfile = transformUserImageUrls(user);
      const transformedMutualFriends = mutualFriendsData.map(transformUserImageUrls);
      const transformedRecentPosts = recentPostsData.map(post => ({
          ...post,
          user: post.user ? transformUserImageUrls(post.user) : null
      }));
      // -----------------------


      // Structure the response
      return res.json({
        profile: { // Keep the nested structure if frontend expects it
            ...transformedProfile,
            friendCount: user.friends ? user.friends.length : 0
        },
        relationshipStatus: { isOwnProfile, isFriend, hasSentRequest, hasReceivedRequest },
        recentPosts: transformedRecentPosts,
        mutualFriends: transformedMutualFriends
      });

    } catch (err) {
      console.error('Error in getUserProfile:', (err as Error).message);
      return res.status(500).send('Server error');
    }
};

/**
 * @route   PUT api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
export const updateProfile = async (req: Request, res: Response): Promise<Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    console.log("Update profile called for user:", req.user.id);
    console.log("Request body:", req.body);

    const { firstName, lastName, bio, location, birthday } = req.body;

    // --- Build update object ---
    //    THIS IS WHERE updateFields IS DECLARED
    const updateFields: Partial<IUser> = {};
    // -----------------------------
    if (firstName !== undefined) updateFields.firstName = firstName; // Check for undefined to allow empty strings
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (bio !== undefined) updateFields.bio = bio;
    if (location !== undefined) updateFields.location = location;
    if (birthday) { // Birthday might be null or empty string, handle appropriately
        try {
            updateFields.birthday = new Date(birthday);
            // Check if date is valid, if not, you might want to skip or error
            if (isNaN(updateFields.birthday.getTime())) {
                console.warn("Invalid birthday date received:", birthday);
                delete updateFields.birthday; // Don't set if invalid
            }
        } catch (dateError) {
            console.warn("Error parsing birthday date:", birthday, dateError);
            // Decide if you want to error out or just skip the birthday field
            // return res.status(400).json({ message: 'Invalid birthday format' });
        }
    }


    console.log("Fields to update:", updateFields);

    // Check if update object is empty
    if (Object.keys(updateFields).length === 0) {
      console.log("Warning: No valid fields to update");
      // It's not necessarily an error if they send empty validatable fields
      // but if all fields are undefined, it's good to note.
      // You might choose to return current user data or a specific message.
      const currentUser = await User.findById(req.user.id)
        .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires')
        .lean();
      if (!currentUser) return res.status(404).json({ message: 'User not found' });
      return res.json(transformUserImageUrls(currentUser));
    }

    // Get user before update to compare (optional, for detailed logging)
    // const beforeUser = await User.findById(req.user.id).lean();
    // console.log("User before update:", beforeUser);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true } // runValidators ensures schema validation
    )
    .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken -verificationTokenExpires') // Select desired fields
    .lean(); // Use lean for plain JS object

    console.log("DB operation result (updatedUser):", updatedUser);

    if (!updatedUser) {
      console.log("User not found after update attempt");
      return res.status(404).json({ message: 'User not found during update' });
    }

    // Logging changes (optional)
    // if (beforeUser) {
    //   console.log("Changes applied:");
    //   Object.keys(updateFields).forEach(field => {
    //     if (field === 'birthday' && updateFields.birthday && beforeUser.birthday) {
    //       console.log(`- ${field}: ${beforeUser.birthday?.toISOString()} -> ${updateFields.birthday?.toISOString()}`);
    //     } else {
    //       console.log(`- ${field}: ${(beforeUser as any)[field]} -> ${(updatedUser as any)[field]}`);
    //     }
    //   });
    // }

    // The fallback logic using user.save() might be redundant if findByIdAndUpdate is working well
    // with runValidators and new:true. If findByIdAndUpdate doesn't apply changes as expected,
    // this block might be needed, but typically it's not.

    return res.json(transformUserImageUrls(updatedUser));

  } catch (err) {
    console.error("Error updating profile:", err);
    if (err instanceof mongoose.Error.ValidationError) {
        return res.status(400).json({ message: "Validation failed", errors: err.errors });
    }
    return res.status(500).send('Server error');
  }
};

/**
 * @route   POST api/profile/picture  // <--- UPDATED PATH HERE
 * @desc    Upload profile picture
 * @access  Private (requires authentication)
 */
export const uploadProfilePicture = async (req: Request, res: Response): Promise<Response> => {
  console.log('--- [Controller] uploadProfilePicture: Entered ---');

  // Check if user is authenticated (req.user should be populated by auth middleware)
  // req.user might have a more specific type based on your auth middleware
  if (!req.user || !(req.user as any).id) {
    console.error('[Controller] uploadProfilePicture: Error - User not authenticated or ID missing from req.user.');
    return res.status(401).json({ message: 'Not authorized. User ID missing.' });
  }
  const userId = (req.user as any).id;

  // Check if a file was uploaded (req.file should be populated by multer middleware)
  if (!req.file) {
    console.error('[Controller] uploadProfilePicture: Error - No file uploaded.');
    return res.status(400).json({ message: 'No file uploaded. Please select an image.' });
  }

  console.log(`[Controller] uploadProfilePicture: File received for user ${userId}:`, req.file.filename);

  try {
    // Find the user in the database
    const userToUpdate = await User.findById(userId);

    if (!userToUpdate) {
      console.error(`[Controller] uploadProfilePicture: Error - User not found with ID: ${userId}`);
      // If user not found, the uploaded file is orphaned, attempt to delete it.
      fs.unlink(req.file.path, (err) => {
        if (err) console.error(`[Controller] uploadProfilePicture: Error deleting orphaned file ${req.file?.path}:`, err);
        else console.log(`[Controller] uploadProfilePicture: Deleted orphaned file: ${req.file?.path}`);
      });
      return res.status(404).json({ message: 'User not found' });
    }

    // Get the filename of the old profile picture
    const oldProfilePictureFilename = userToUpdate.profilePicture;

    // Update the user's profilePicture field with the new filename from multer
    userToUpdate.profilePicture = req.file.filename;
    await userToUpdate.save();
    console.log(`[Controller] uploadProfilePicture: User ${userToUpdate.username} profile picture updated in DB to: ${userToUpdate.profilePicture}`);

    // If there was an old profile picture and it wasn't the default, delete it from the server
    if (oldProfilePictureFilename && oldProfilePictureFilename !== 'default-avatar.png') {
      // Construct the absolute path to the old picture
      // __dirname is the directory of the current module (src/controllers)
      // Adjust the relative path to '../../uploads/profile' accordingly
      const oldPicturePath = path.join(__dirname, '../../uploads/profile', oldProfilePictureFilename);

      if (fs.existsSync(oldPicturePath)) {
        fs.unlink(oldPicturePath, (err) => {
          if (err) {
            console.error(`[Controller] uploadProfilePicture: Error deleting old profile picture ${oldPicturePath}:`, err);
          } else {
            console.log(`[Controller] uploadProfilePicture: Successfully deleted old profile picture: ${oldPicturePath}`);
          }
        });
      } else {
        console.warn(`[Controller] uploadProfilePicture: Old profile picture not found at path: ${oldPicturePath}. Skipping delete.`);
      }
    }

    // Construct the full URL for the newly uploaded profile picture
    const newProfilePictureUrl = getFileUrl(userToUpdate.profilePicture, 'profile');

    return res.status(200).json({
      message: 'Profile picture updated successfully',
      profilePicture: userToUpdate.profilePicture, // The filename
      profilePictureUrl: newProfilePictureUrl     // The full URL for frontend use
    });

  } catch (error) {
    const err = error as Error;
    console.error('[Controller] uploadProfilePicture: Server error during profile picture upload:', err.message, err.stack);
    // If an error occurs after file upload but before DB save, try to delete the uploaded file
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error(`[Controller] uploadProfilePicture: Error deleting file ${req.file?.path} after DB error:`, unlinkErr);
        else console.log(`[Controller] uploadProfilePicture: Cleaned up file ${req.file?.path} after error.`);
      });
    }
    return res.status(500).json({ message: 'Server error during profile picture upload.' });
  }
};

/**
 * @route   POST api/users/profile/cover // Or api/profile/cover based on your routes
 * @desc    Upload cover photo
 * @access  Private
 */
export const uploadCoverPhoto = async (req: Request, res: Response): Promise<Response> => {
  console.log('--- [Controller] uploadCoverPhoto: Entered ---');
  try {
    if (!req.user || !(req.user as any).id) {
      console.error('[Controller] uploadCoverPhoto: Error - User not authenticated or ID missing.');
      return res.status(401).json({ message: 'Not authorized. User ID missing.' });
    }
    const userId = (req.user as any).id;

    if (!req.file) {
      console.error('[Controller] uploadCoverPhoto: Error - No file uploaded.');
      return res.status(400).json({ message: 'No file uploaded. Please select an image.' });
    }
    console.log(`[Controller] uploadCoverPhoto: File received for user ${userId}:`, req.file.filename);

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      console.error(`[Controller] uploadCoverPhoto: Error - User not found with ID: ${userId}`);
      fs.unlink(req.file.path, (err) => {
        if (err) console.error(`[Controller] uploadCoverPhoto: Error deleting orphaned file ${req.file?.path}:`, err);
        else console.log(`[Controller] uploadCoverPhoto: Deleted orphaned file: ${req.file?.path}`);
      });
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete old cover photo
    const oldFilename = userToUpdate.coverPhoto;
    if (oldFilename && oldFilename !== 'default-cover.png') {
      const oldCoverPath = path.join(__dirname, '../../uploads/covers', oldFilename);
      if (fs.existsSync(oldCoverPath)) {
        fs.unlink(oldCoverPath, (unlinkErr) => { // Changed to async unlink
          if (unlinkErr) console.error(`[Controller] uploadCoverPhoto: Error deleting old cover photo ${oldCoverPath}:`, unlinkErr);
          else console.log(`[Controller] uploadCoverPhoto: Deleted old cover photo ${oldCoverPath}`);
        });
      } else {
          console.warn(`[Controller] uploadCoverPhoto: Old cover photo not found at path: ${oldCoverPath}. Skipping delete.`);
      }
    }

    // Update user cover photo field with the new FILENAME
    userToUpdate.coverPhoto = req.file.filename;
    await userToUpdate.save();
    console.log(`[Controller] uploadCoverPhoto: User ${userToUpdate.username} cover photo updated in DB to: ${userToUpdate.coverPhoto}`);


    // Construct the full URL for the newly uploaded cover photo
    const newCoverPhotoUrl = getFileUrl(userToUpdate.coverPhoto, 'cover');

    // --- MODIFIED RESPONSE ---
    return res.status(200).json({
      message: 'Cover photo updated successfully',
      coverPhoto: userToUpdate.coverPhoto, // Send back the FILENAME
      coverPhotoUrl: newCoverPhotoUrl      // Send back the FULL URL
    });
    // -----------------------

  } catch (err) {
    const error = err as Error;
    console.error('[Controller] uploadCoverPhoto: Error uploading cover photo:', error.message, error.stack);
    // Cleanup potentially uploaded file on error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error(`[Controller] uploadCoverPhoto: Error cleaning up failed upload ${req.file?.path}:`, unlinkErr);
        else console.log(`[Controller] uploadCoverPhoto: Cleaned up failed upload: ${req.file?.path}`);
      });
    }
    return res.status(500).send('Server error during cover photo upload.');
  }
};

/**
 * @route   GET api/users/friends
 * @desc    Get user's friends
 * @access  Private
 */
export const getFriends = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    // Fetch user with populated friends, selecting necessary fields including image
    const user = await User.findById(req.user.id)
      .populate('friends', 'username firstName lastName profilePicture isOnline lastActive') // Select fields in populate
      .select('friends') // Only select the friends array from the main user doc
      .lean();

    if (!user || !user.friends) return res.json([]); // Return empty if no user or no friends array

    // --- Transform image URLs before sending ---
    // user.friends is now an array of populated friend objects
    const transformedFriends = user.friends.map(transformUserImageUrls);
    // -----------------------------------------

    return res.json(transformedFriends);

  } catch (err) {
    console.error('Error in getFriends:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};


/**
 * @route   GET api/users/friend-requests
 * @desc    Get user's friend requests (received)
 * @access  Private
 */
export const getFriendRequests = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const user = await User.findById(req.user.id)
      .populate('friendRequests', 'username firstName lastName profilePicture') // Select fields
      .select('friendRequests')
      .lean();

    if (!user || !user.friendRequests) return res.json([]);

    // --- Transform image URLs before sending ---
    const transformedRequests = user.friendRequests.map(transformUserImageUrls);
    // -----------------------------------------

    return res.json(transformedRequests);

  } catch (err) {
    console.error('Error in getFriendRequests:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};


// --- FRIEND MANAGEMENT (send, accept, reject, remove, block, unblock) ---
// These typically don't return full user objects in the response,
// so transformation might not be needed unless you change their return values.
// Review each one if you intend to return user data from them.
export const sendFriendRequest = async ( /* ... */ ) => { /* ... */ };
export const acceptFriendRequest = async ( /* ... */ ) => { /* ... */ };
export const rejectFriendRequest = async ( /* ... */ ) => { /* ... */ };
export const removeFriend = async ( /* ... */ ) => { /* ... */ };
export const blockUser = async ( /* ... */ ) => { /* ... */ };
export const unblockUser = async ( /* ... */ ) => { /* ... */ };
// ---------------------------------------------------------------------


/**
 * @route   GET api/users/blocked
 * @desc    Get blocked users
 * @access  Private
 */
export const getBlockedUsers = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const user = await User.findById(req.user.id)
      .populate('blockedUsers', 'username firstName lastName profilePicture') // Select fields
      .select('blockedUsers')
      .lean();

    if (!user || !user.blockedUsers) return res.json([]);

    // --- Transform image URLs before sending ---
    const transformedBlocked = user.blockedUsers.map(transformUserImageUrls);
    // -----------------------------------------

    return res.json(transformedBlocked);

  } catch (err) {
    console.error('Error in getBlockedUsers:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};


/**
 * @route   GET api/users/online-friends
 * @desc    Get online friends
 * @access  Private
 */
export const getOnlineFriends = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const user = await User.findById(req.user.id).select('friends').lean(); // Only need friend IDs
    if (!user || !user.friends) return res.json([]);

    const onlineFriends = await User.find({
      _id: { $in: user.friends }, // Find users whose IDs are in the friends list
      isOnline: true // Filter by online status
    }).select('username firstName lastName profilePicture lastActive') // Select fields
      .lean();

    // --- Transform image URLs before sending ---
    const transformedOnlineFriends = onlineFriends.map(transformUserImageUrls);
    // -----------------------------------------

    return res.json(transformedOnlineFriends);

  } catch (err) {
    console.error('Error in getOnlineFriends:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};


/**
 * @route   PUT api/users/privacy-settings
 * @desc    Update privacy settings
 * @access  Private
 */

export const updatePrivacySettings = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Optional: Add validation for the request body if you have express-validator rules
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user) { // req.user should be set by your auth middleware
      return res.status(401).json({ message: 'Not authorized' });
    }

    const { profileVisibility, friendsVisibility, postsVisibility } = req.body;

    // --- FETCH THE USER DOCUMENT FROM THE DATABASE ---
    const userToUpdate = await User.findById(req.user.id);
    // ------------------------------------------------

    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize privacySettings object if it doesn't exist on the document
    if (!userToUpdate.privacySettings) {
      userToUpdate.privacySettings = {
        profileVisibility: 'public', // Set your desired defaults
        friendsVisibility: 'public',
        postsVisibility: 'public'
      };
    }

    // Apply updates from req.body if they are provided
    // Check for undefined to allow explicit setting to empty string or valid enum values
    if (profileVisibility !== undefined) {
      userToUpdate.privacySettings.profileVisibility = profileVisibility;
    }
    if (friendsVisibility !== undefined) {
      userToUpdate.privacySettings.friendsVisibility = friendsVisibility;
    }
    if (postsVisibility !== undefined) {
      userToUpdate.privacySettings.postsVisibility = postsVisibility;
    }

    // Save the changes to the user document
    await userToUpdate.save(); // Now 'userToUpdate' is defined and is a Mongoose document

    return res.json({
      message: 'Privacy settings updated',
      privacySettings: userToUpdate.privacySettings // Return the updated settings
    });

  } catch (err) {
    console.error('Error in updatePrivacySettings:', (err as Error).message);
    return res.status(500).send('Server error');
  }
};


// --- ADMIN FUNCTIONS (getInactiveUsers, reportUser, getReportedUsers) ---
// These likely don't need image transformation unless the admin UI displays avatars.
// Review their .select() statements and return values if needed.
export const getInactiveUsers = async ( /* ... */ ) => { /* ... */ };
export const reportUser = async ( /* ... */ ) => { /* ... */ };
export const getReportedUsers = async ( /* ... */ ) => { /* ... */ };
// ------------------------------------------------------------------