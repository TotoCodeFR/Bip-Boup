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
    secure: false,
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
app.use('/interpreter.js' ,express.static(path.join(__dirname, 'interpreter.js')))

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

// Simple validation function for token format (basic)
function isValidBotToken(token) {
  return /^Bot\s?[A-Za-z0-9._-]{50,}$/.test(token) || /^[A-Za-z0-9._-]{50,}$/.test(token);
}

app.post('/api/add-bot', async (req, res) => {
  const { bot_token } = req.body;

  if (!bot_token || !isValidBotToken(bot_token)) {
    return res.status(400).json({ error: 'Invalid bot token format' });
  }

  try {
    // Optional: strip 'Bot ' prefix if user sent it
    const cleanToken = bot_token.startsWith('Bot ') ? bot_token.slice(4) : bot_token;

    // Insert into Supabase
    let botInfo
    try {
      const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bot ${cleanToken}`
        }
      });
      if (!discordRes.ok) {
        throw new Error('Failed to fetch bot info from Discord');
      }
      botInfo = await discordRes.json();
    } catch (discordError) {
      return res.status(500).json({ error: `Failed to fetch bot info: ${discordError.message}` });
    }

    const { data, error } = await supabase.from('bots').insert([{ bot_id: botInfo.id, bot_token: cleanToken, owner_id: req.user.discord_id || req.user.id }]).select().single();

    if (error) {    
      throw error;
    }

    res.status(201).json({ message: 'Bot added', bot: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bot-info/:botId', async (req, res) => {
  const botId = req.params.botId;

  // Retrieve bot token securely from Supabase
  const { data, error } = await supabase
    .from('bots')
    .select('bot_token')
    .eq('bot_id', botId)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Bot token not found' });
  }

  const botToken = data.bot_token;

  try {
    const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${botToken}`
      }
    });

    if (!discordRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch bot info from Discord' });
    }

    const botUser = await discordRes.json();
    const avatarUrl = botUser.avatar
      ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=512`
      : "https://cdn.discordapp.com/embed/avatars/3.png";

    res.json({ username: botUser.username, avatar: avatarUrl, id: botUser.id });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/get-bots', checkAuth, async (req, res) => {
  const { data: bots, error } = await supabase
    .from('bots')
    .select('*')
    .eq('owner_id', req.user.discord_id || req.user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

    for (const bot of bots) {
      try {
        const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
          headers: {
            Authorization: `Bot ${bot.bot_token}`
          }
        });

        if (!discordRes.ok) {
          console.error(`Failed to fetch info for bot ${bot.id}:`, discordRes.statusText);
          bot.avatar = "https://cdn.discordapp.com/embed/avatars/3.png"; // Set a default or handle error
          continue;
        }

        const botUser = await discordRes.json();
        bot.name = botUser.username;
        bot.avatar = botUser.avatar
          ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=512`
          : "https://cdn.discordapp.com/embed/avatars/3.png";
        bot.id = botUser.id;
      } catch (e) {
        console.error(`Error fetching info for bot ${bot.id}:`, e);
        bot.avatar = "https://cdn.discordapp.com/embed/avatars/3.png"; // Set a default or handle error
      }
    }


  res.json(bots);
})

app.get('/dashboard/:botId/:tab', checkAuth, async (req, res) => {
  const botId = req.params.botId
  const tab = req.params.tab
  const userId = req.user.discord_id || req.user.id;

  const { data: bot, error } = await supabase
    .from('bots')
    .select('*')
    .eq('bot_id', botId)
    .single();

  if (error || !bot) {
    console.error(error);
    return res.status(404).send('Bot not found');
  }

  // Check if the user is the owner of the bot
  if (bot.owner_id !== userId) {
    return res.status(403).send('Unauthorized');
  }

  res.sendFile(path.join(__dirname, 'panel', 'dashboard', 'general', 'index.html'));
})

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
  console.log('✅ Serveur connecté au port ' + process.env.PORT || 3000);
});