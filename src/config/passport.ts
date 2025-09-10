import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User'; // Adjust path to your User model

// --- Serialization and Deserialization ---
// Tells Passport how to save a user's ID into the session.
passport.serializeUser((user: any, done) => {
  // The `user` object here is the full user profile returned from the strategy's `done` callback.
  // We only store the unique ID to keep the session data small.
  done(null, user.id);
});

// Tells Passport how to retrieve the full user details from the session.
passport.deserializeUser(async (id: string, done) => {
  try {
    // Use the ID stored in the session to find the user in the database.
    const user = await User.findById(id);
    done(null, user); // Attaches the user object to req.user
  } catch (err) {
    done(err, null);
  }
});


// --- Google OAuth Strategy ---
// This strategy is used for logging in users with their Google account.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback' // The URL Google redirects to after authentication.
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find an existing user by their Google ID.
      let user = await User.findOne({ googleId: profile.id });

      // If no user is found, create a new one.
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails?.[0].value,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          profileImage: profile.photos?.[0].value,
          isEmailVerified: true, // Google accounts are considered verified.
        });
      }
      
      // Pass the user object to the `serializeUser` function.
      return done(null, user);
    } catch (err) {
      return done(err, false);
    }
  }));
}

// Export the fully configured passport instance.
export default passport;

