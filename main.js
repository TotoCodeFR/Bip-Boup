import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseClient } from './utility/supabase.js';

const supabase = getSupabaseClient()

function getDiscordAvatarURL(id, avatar) {
  if (!avatar || avatar.startsWith('http')) {
    return avatar ?? ''; // already full URL or null
  }

  const format = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${format}?size=512`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Permet d'utiliser JSON dans les requêtes
app.use(express.json());

// ====== Setup sessions Discord depuis Supabase ======
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.REDIRECT_URI,
  scope: ['identify'],
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const discordId = profile.id;

    // On *essaie* de retrouver l'utilisateur
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', discordId)
      .single();

    if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = aucune ligne trouvée
      console.error('Supabase select error:', selectError);
      return done(selectError, null);
    }

    const now = new Date().toISOString();

    if (!existingUser) {
      // Insert new user
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

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        return done(insertError, null);
      }

      profile.supabaseUser = insertedUser;
    } else {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          last_login: now
        })
        .eq('discord_id', discordId);

      if (updateError) {
        console.error('Supabase update error:', updateError);
        // Ce n'est pas une erreur fatale donc on peuut continuer
      }

      profile.supabaseUser = existingUser;
    }

    profile.accessToken = accessToken; // garder le token d'accès Discord au cas où
    done(null, profile);
  } catch (error) {
    console.error('Discord strategy error:', error);
    done(error, null);
  }
}));

// ====== Passport + Applis autorisées Discord ======
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,                      // ne sauvegarde pas la session si non modifiée
    saveUninitialized: false,          // ne pas créer la session jusqu'à ce que quelque chose soit crée
    cookie: {
      secure: process.env.PORT === 10000,                   // true = HTTPS, false = HTTP
      maxAge: 1000 * 60 * 60 * 24 * 7  // durée: 7j (peut être à ajuster)
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  // Garder uniquement l'ID Supabase ou Discord
  done(null, user.supabaseUser.discord_id);
});

passport.deserializeUser(async (discordId, done) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', discordId)
      .single();

    if (error) {
      return done(error, null);
    }
    done(null, data);
  } catch (err) {
    done(err, null);
  }
});

// ====== Chemins web ======

app.get('/auth/discord', passport.authenticate('discord'));

app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

app.use('/assets', express.static('panel'));

app.use(express.static(path.join(__dirname, 'panel')));

app.get('/ping', (req, res) => {
  res.send('Le bot est en ligne et fonctionne correctement !');
});

app.get('/api/user', checkAuth, (req, res) => {
  const id = req.user.discord_id || req.user.id;
  const avatarHash = req.user.avatar;
  const avatarUrl = getDiscordAvatarURL(id, avatarHash);

  res.json({
    username: req.user.username,
    discriminator: req.user.discriminator,
    id,
    avatar: avatarUrl
  });
});

app.get('/logout', (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel', 'index.html'));
});

// Démarrer le serveur Express
app.listen(process.env.PORT, () => {
  console.log('✅ Serveur connecté!');
});
