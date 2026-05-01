import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import database from "../database/db.js";

// ═══════════════════════════════════════════════════════════
// PASSPORT GOOGLE STRATEGY
// This runs when the user comes back from Google
// after accepting the permissions
// ═══════════════════════════════════════════════════════════
passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email  = profile.emails[0].value;
        const name   = profile.displayName;
        const avatar = profile.photos[0].value;
        const googleId = profile.id;

        // ── Check if user already exists with this email ──
        const existingUser = await database.query(
          "SELECT * FROM users WHERE email = $1", [email]
        );

        if (existingUser.rows.length > 0) {
          // User exists → update google_id if not set yet
          const user = existingUser.rows[0];

          if (!user.google_id) {
            await database.query(
              "UPDATE users SET google_id=$1 WHERE id=$2",
              [googleId, user.id]
            );
          }

      const refreshed = await database.query(
  "SELECT id, name, email, avatar, role, is_verified, google_id FROM users WHERE id = $1",
  [existingUser.rows[0].id]
);
return done(null, refreshed.rows[0]);
        }

        // ── User doesn't exist → create a new account ─────
        // Google users are auto-verified (email confirmed by Google)
        const newUser = await database.query(
          `INSERT INTO users (name, email, avatar, google_id, role, is_verified)
           VALUES ($1, $2, $3, $4, 'user', true)
           RETURNING id, name, email, avatar, role, is_verified`,
          [name, email, avatar, googleId]
        );

        return done(null, newUser.rows[0]);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);


passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const result = await database.query(
      "SELECT id, name, email, avatar, role, is_verified FROM users WHERE id = $1",
      [id]
    );
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

export default passport;