require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const MongoStore = require("connect-mongo");

const app = express();
app.use(helmet({
  contentSecurityPolicy: false
}));


if (!process.env.SESSION_SECRET) {
  console.error("❌ SESSION_SECRET manquant dans .env");
  process.exit(1);
}

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/auth", authLimiter);
app.use("/dashboard", authLimiter);

/* ================= CONFIG EJS ================= */

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: true }));

/* ================= CONFIG DISCORD ================= */

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.DISCORD_CALLBACK_URL;

/* ================= MONGODB ================= */

mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on("connected", () => {
    console.log("🟢 MongoDB connecté (SITE)");
});

mongoose.connection.on("error", (err) => {
    console.log("🔴 Erreur MongoDB :", err);
});

/* ================= MODEL ================= */

const GuildConfig = mongoose.model("GuildConfig", {
    guildId: String,

    aiEnabled: { type: Boolean, default: false },

    ticketCategoryId: { type: String, default: null },
    welcomeChannelId: { type: String, default: null },
    autoRoleId: { type: String, default: null }
});

/* ================= PASSPORT ================= */

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds']
},
(accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.set("trust proxy", 1);

app.use(session({
  name: "nexora.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 60 * 60 * 24 * 7
  }),

  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(passport.initialize());
app.use(passport.session());

/* ================= MIDDLEWARE LOGIN ================= */

function checkAuth(req, res, next) {
    if (!req.user) return res.redirect('/');
    next();
}

/* ================= HOME ================= */

app.get('/', (req, res) => {

    if (!req.user) {
        return res.render('home', {
            user: null,
            guilds: []
        });
    }

    const guilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8);

    res.render('home', {
        user: req.user,
        guilds: guilds
    });
});

/* ================= DASHBOARD ================= */

app.get('/dashboard/:guildId', checkAuth, async (req, res) => {

    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    if (!guild) return res.redirect('/');

    let config = await GuildConfig.findOne({ guildId: guild.id });

    if (!config) {
        config = await GuildConfig.create({
            guildId: guild.id
        });
    }

    res.render('dashboard', {
        guild: guild,
        config: config
    });
});

/* ================= SAVE CONFIG ================= */

app.post('/dashboard/:guildId/save', checkAuth, async (req, res) => {

    await GuildConfig.findOneAndUpdate(
        { guildId: req.params.guildId },
        {
            ticketCategoryId: req.body.ticketCategoryId || null,
            welcomeChannelId: req.body.welcomeChannelId || null,
            autoRoleId: req.body.autoRoleId || null
        },
        { upsert: true }
    );

    res.redirect(`/dashboard/${req.params.guildId}`);
});

/* ================= TOGGLE IA ================= */

app.get('/toggle-ai/:guildId', checkAuth, async (req, res) => {

    let config = await GuildConfig.findOne({ guildId: req.params.guildId });

    if (!config) {
        config = await GuildConfig.create({
            guildId: req.params.guildId,
            aiEnabled: true
        });
    } else {
        config.aiEnabled = !config.aiEnabled;
        await config.save();
    }

    res.redirect(`/dashboard/${req.params.guildId}`);
});

/* ================= AUTH ================= */

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/');
    }
);

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Dashboard lancé sur le port ${PORT}`);
});