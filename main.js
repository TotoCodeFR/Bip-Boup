import { getDopplerClient } from './utility/doppler.js';
import 'dotenv/config';
await getDopplerClient(); // Secrets provenant de Doppler injectés

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import connectPg from 'connect-pg-simple';
import { getSupabaseClient } from './utility/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabase = getSupabaseClient();
const app = express();

// ====== PostgreSQL store de session ======
const PgSession = connectPg(session);
const pgPool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(session({
  store: new PgSession({
    pool: pgPool,
    tableName: 'user_sessions'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS en prod
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 jours
  }
}));

// ====== Autres middleware ======
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

// ====== Discord OAuth ======
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.REDIRECT_URI,
  scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const discordId = profile.id;

    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', discordId)
      .single();

    const now = new Date().toISOString();

    if (!existingUser) {
      const { data: insertedUser, error: insertError } = await supabase
        .from('users')
        .insert({
          discord_id: discordId,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          created_at: now,
          last_login: now
        })
        .select()
        .single();

      if (insertError) return done(insertError, null);
      profile.supabaseUser = insertedUser;
    } else {
      await supabase
        .from('users')
        .update({
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          last_login: now
        })
        .eq('discord_id', discordId);
      profile.supabaseUser = existingUser;
    }

    profile.accessToken = accessToken;
    done(null, profile);
  } catch (error) {
    done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.supabaseUser.discord_id);
});

passport.deserializeUser(async (discordId, done) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('discord_id', discordId)
    .single();
  done(error, data);
});

// ====== Routes ======
function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

function getDiscordAvatarURL(id, avatar) {
  if (!avatar || avatar.startsWith('http')) {
    return avatar ?? '';
  }
  const format = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${format}?size=512`;
}

app.use('/assets', express.static('panel'));
app.use(express.static(path.join(__dirname, 'panel')));

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/ping', (req, res) => res.send('Service en ligne !'));

app.get('/api/user', checkAuth, (req, res) => {
  const id = req.user.discord_id || req.user.id;
  const avatarUrl = getDiscordAvatarURL(id, req.user.avatar);

  res.json({
    username: req.user.username,
    discriminator: req.user.discriminator,
    id,
    avatar: avatarUrl
  });
});

app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/');
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Serveur connecté!');
});
