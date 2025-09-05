// src/config/passport.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User'; // Adjust path to your User model
import { Role } from '../config/roles'; 

const callbackURL = process.env.NODE_ENV === 'production'
  ? process.env.GOOGLE_CB_URL_PROD
  : process.env.GOOGLE_CB_URL_DEV;

// Validate environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('Missing Google OAuth credentials in environment variables');
  throw new Error('Google OAuth credentials not configured');
}

console.log('Configuring Google OAuth Strategy...'); // Debug log

// Define the verify function with explicit types
const verifyCallback = async (
  accessToken: string,
  refreshToken: string,
  profile: any, // Using any to avoid type conflicts
  done: (error: any, user?: any) => void
) => {
  try {
    console.log('=== Google Strategy Callback ===');
    console.log('Profile ID:', profile.id);
    console.log('Profile email:', profile.emails?.[0]?.value);
    console.log('Profile name:', profile.displayName);
    console.log('================================');
    
    // Check if user already exists in our database
    let user = await User.findOne({ 
      $or: [
        { googleId: profile.id },
        { email: profile.emails?.[0]?.value }
      ]
    });
    
    if (user) {
      console.log('Existing user found:', user.email);
      // User exists, update googleId if it wasn't set before
      if (!user.googleId) {
        user.googleId = profile.id;
        user.authProvider = 'google';
        user.isOAuthUser = true;
        user.isEmailVerified = true;
        await user.save();
        console.log('Updated existing user with Google OAuth info');
      }
      return done(null, user);
    } else {
      console.log('Creating new user from Google profile');
      
      // Generate a unique username
      const emailUsername = profile.emails?.[0]?.value?.split('@')[0];
      let baseUsername = emailUsername || `user_${profile.id}`;
      let username = baseUsername;
      let counter = 1;
      
      // Check if username already exists and make it unique
      while (await User.findOne({ username })) {
        username = `${baseUsername}_${counter}`;
        counter++;
      }
      
      // Extract names with safe fallbacks
      const firstName = (profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User').toString().trim();
      const lastName = (profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '').toString().trim();
      
      // Create new user with proper role value
      const newUser = new User({
        googleId: profile.id,
        username: username,
        firstName: firstName,
        lastName: lastName,
        email: profile.emails?.[0]?.value || '',
        profilePicture: profile.photos?.[0]?.value || 'default-avatar.png',
        authProvider: 'google',
        isOAuthUser: true,
        isEmailVerified: true, // Google accounts are pre-verified
        role: Role.USER, // Use the enum constant from your roles config
      });
      
      const savedUser = await newUser.save();
      console.log('New user created successfully:', {
        id: savedUser._id,
        email: savedUser.email,
        username: savedUser.username
      });
      return done(null, savedUser);
    }
  } catch (error) {
    console.error('Error in Google OAuth strategy:', error);
    return done(error, null);
  }
};

passport.use('google', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://trippy.lol/api/auth/google/callback",
  scope: ['profile', 'email'],
  passReqToCallback: false
}, verifyCallback));

// Serialize user for session
passport.serializeUser((user: any, done: (error: any, id?: any) => void) => {
  console.log('Serializing user:', user._id);
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done: (error: any, user?: any) => void) => {
  try {
    console.log('Deserializing user:', id);
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    console.error('Error deserializing user:', error);
    done(error, null);
  }
});

console.log('Google OAuth Strategy configured successfully'); // Debug log