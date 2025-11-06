// src/config/passport.ts
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User';

// --- Serialization and Deserialization ---
// Tells Passport how to save a user's ID into the session.
passport.serializeUser((user: any, done) => {
  console.log('🔵 Serializing user:', user._id || user.id);
  // Store the MongoDB _id (or id) in the session
  done(null, user._id?.toString() || user.id);
});

// Tells Passport how to retrieve the full user details from the session.
passport.deserializeUser(async (id: string, done) => {
  console.log('🔵 Deserializing user:', id);
  try {
    // Use the ID stored in the session to find the user in the database
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      console.log('❌ User not found during deserialization');
      return done(null, false);
    }
    
    console.log('✅ User deserialized:', user.username || user.email);
    done(null, user); // Attaches the user object to req.user
  } catch (err) {
    console.error('❌ Deserialization error:', err);
    done(err, null);
  }
});

// --- Google OAuth Strategy ---
// This strategy is used for logging in users with their Google account.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find an existing user by their Google ID
      let user = await User.findOne({ googleId: profile.id });

      // If no user is found, create a new one
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails?.[0].value,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          profilePicture: profile.photos?.[0].value,
          username: profile.emails?.[0].value?.split('@')[0] + '_' + Date.now(),
          isEmailVerified: true,
        });
      }

      console.log('✅ Google OAuth user authenticated:', user.email);
      return done(null, user);
    } catch (err) {
      console.error('❌ Google OAuth error:', err);
      return done(err, false);
    }
  }));
} else {
  console.warn('⚠️  Google OAuth not configured (missing CLIENT_ID or CLIENT_SECRET)');
}

// Export the fully configured passport instance
export default passport;