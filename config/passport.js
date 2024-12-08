const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/githubIntegration');  // MongoDB model

passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.CALLBACK_URL,  // GitHub callback URL
        scope: ['read:org', 'repo', 'user']  // Required GitHub OAuth Scopes
    },
    async function(accessToken, refreshToken, profile, done) {
        try {
            const user = await User.findOneAndUpdate(
                { githubId: profile.id },
                {
                    accessToken,
                    profile,
                    connectedAt: new Date()
                },
                { upsert: true, new: true }
            );
            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));

passport.serializeUser((user, done) => done(null, user.id));  // Serialize the user to store in the session
passport.deserializeUser(async (id, done) => {
    try {
        if(id) {
            const user = await User.findById(id);
            done(null, user);  // Pass the user to the session
        } else {
            done(null);
        }
    } catch (err) {
        done(err, null);  // If an error occurs, pass the error
    }
});
