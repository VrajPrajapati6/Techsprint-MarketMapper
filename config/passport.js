const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User.js");

// --- STRATEGY 1: Local (Email/Password) ---
// We pass { usernameField: 'email' } so it looks for req.body.email
passport.use(new LocalStrategy(
    { usernameField: 'email' }, 
    User.authenticate()
));

// --- STRATEGY 2: Google ---
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.CLIENT_URL + "/auth/google/callback",
    },
    async function (accessToken, refreshToken, profile, cb) {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            user.image = profile.photos[0].value;
            await user.save();
            return cb(null, user);
        } else {
          user = await User.create({
            username: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            image: profile.photos[0].value
          });
          return cb(null, user);
        }
      } catch (err) {
        return cb(err, null);
      }
    }
  )
);

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());