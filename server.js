require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const path = require('path');
const fs = require('fs');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const OWNER_ID = process.env.OWNER_ID;

function globalBansPath() { return path.join(DATA_DIR, 'global-bans.json'); }
function adminLogPath() { return path.join(DATA_DIR, 'admin-log.json'); }

function listGuildIds() {
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('config_') && f.endsWith('.json'))
    .map(f => f.slice('config_'.length, -'.json'.length));
}

// Server-side gate — this is the ONLY thing that matters for security.
// The admin.html page itself is just UI; every route below re-checks this.
function requireOwner(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  if (!OWNER_ID || req.user.id !== OWNER_ID) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function logAdminAction(adminId, action, targetUserId, reason, extra = {}) {
  const log = readJSON(adminLogPath(), []);
  log.unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    adminId, action, targetUserId,
    reason: reason || '',
    extra,
    timestamp: Date.now(),
  });
  writeJSON(adminLogPath(), log.slice(0, 2000)); // cap log growth
}

function configPath(id) { return path.join(DATA_DIR, `config_${id}.json`); }
function panelsPath(id) { return path.join(DATA_DIR, `panels_${id}.json`); }
function ticketsPath(id) { return path.join(DATA_DIR, `tickets_${id}.json`); }
function guildDataPath(id) { return path.join(DATA_DIR, `guilddata_${id}.json`); }

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'pricey_dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  done(null, profile);
}));

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

async function fetchUserGuilds(accessToken) {
  try {
    const r = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

let botStatus = { online: false, tag: '', guilds: [] };
let pendingBotActions = [];
function notifyBot(type, data) { pendingBotActions.push({ type, data }); }

/* ===== BOT COMMUNICATION ===== */
app.post('/api/bot-status', (req, res) => {
  botStatus = req.body;
  console.log('[SERVER] Bot status received, guilds:', botStatus.guilds);
  res.json({ ok: true });
});

app.get('/api/bot-actions', (req, res) => res.json(pendingBotActions.splice(0)));

app.post('/api/bot-guild-data', (req, res) => {
  if (!botStatus.guildData) botStatus.guildData = {};
  botStatus.guildData[req.body.guildId] = req.body.data;
  writeJSON(guildDataPath(req.body.guildId), req.body.data);
  console.log('[SERVER] Guild data received for:', req.body.guildId);
  res.json({ ok: true });
});

app.post('/api/bot-ticket-update', (req, res) => {
  const { guildId, ticket } = req.body;
  if (!guildId || !ticket?.channelId) return res.json({ ok: false });
  const all = readJSON(ticketsPath(guildId), []);
  const idx = all.findIndex(t => t.channelId === ticket.channelId);
  if (idx >= 0) all[idx] = { ...all[idx], ...ticket };
  else all.unshift(ticket);
  writeJSON(ticketsPath(guildId), all);
  res.json({ ok: true });
});

app.get('/internal/config/:guildId', (req, res) => res.json(readJSON(configPath(req.params.guildId))));
app.get('/internal/panels/:guildId', (req, res) => res.json(readJSON(panelsPath(req.params.guildId), [])));

/* ===== PUBLIC STATUS ===== */
app.get('/api/status', (req, res) => res.json(botStatus));

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ loggedIn: false });
  const u = req.user;
  res.json({ loggedIn: true, user: { id: u.id, username: u.username, avatar: u.avatar } });
});

app.get('/api/guilds', requireAuth, async (req, res) => {
  console.log('[GUILDS] botStatus.guilds:', botStatus.guilds);
  const fresh = await fetchUserGuilds(req.user.accessToken);
  console.log('[GUILDS] fresh count:', fresh?.length);
  const all = fresh || req.user.guilds || [];
  if (fresh) {
    req.user.guilds = fresh;
    await new Promise(resolve => req.session.save(resolve));
  }
  const admin = all.filter(g => (BigInt(g.permissions) & BigInt(0x20)) === BigInt(0x20));
  console.log('[GUILDS] inBot:', admin.filter(g => botStatus.guilds.includes(g.id)).map(g => g.id));
  res.json({
    inBot: admin.filter(g => botStatus.guilds.includes(g.id)),
    notInBot: admin.filter(g => !botStatus.guilds.includes(g.id))
  });
});

app.get('/api/guild/:id', requireAuth, async (req, res) => {
  const fresh = await fetchUserGuilds(req.user.accessToken);
  const all = fresh || req.user.guilds || [];
  const g = all.find(x => x.id === req.params.id);
  if (!g) return res.status(403).json({ error: 'Forbidden' });
  let data = (botStatus.guildData || {})[req.params.id];
  if (!data || !data.channels?.length) {
    data = readJSON(guildDataPath(req.params.id), {});
  }
  console.log('[GUILD] Serving data for:', req.params.id, '| channels:', data.channels?.length);
  res.json({ name: g.name, icon: g.icon, channels: data.channels || [], roles: data.roles || [], categories: data.categories || [] });
});

app.get('/api/config/:guildId', requireAuth, (req, res) => res.json(readJSON(configPath(req.params.guildId))));
app.post('/api/config/:guildId', requireAuth, (req, res) => {
  const updated = { ...readJSON(configPath(req.params.guildId)), ...req.body };
  writeJSON(configPath(req.params.guildId), updated);
  notifyBot('config-update', { guildId: req.params.guildId, config: updated });
  res.json({ ok: true });
});

app.get('/api/panels/:guildId', requireAuth, (req, res) => res.json(readJSON(panelsPath(req.params.guildId), [])));
app.post('/api/panels/:guildId', requireAuth, (req, res) => {
  writeJSON(panelsPath(req.params.guildId), req.body);
  res.json({ ok: true });
});
app.post('/api/panels/:guildId/post', requireAuth, (req, res) => {
  const panels = readJSON(panelsPath(req.params.guildId), []);
  const panel = panels[req.body.panelIndex];
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  notifyBot('post-panel', { guildId: req.params.guildId, panel });
  res.json({ ok: true });
});

/* ===== TICKETS API ===== */
app.get('/api/tickets/:guildId', requireAuth, (req, res) => {
  const tickets = readJSON(ticketsPath(req.params.guildId), []);
  res.json(tickets);
});

app.post('/api/tickets/:guildId/:channelId/action', requireAuth, (req, res) => {
  const { guildId, channelId } = req.params;
  const { action, value } = req.body;

  const tickets = readJSON(ticketsPath(guildId), []);
  const ticket = tickets.find(t => t.channelId === channelId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (action === 'set-reported') {
    ticket.reported = !!value;
    writeJSON(ticketsPath(guildId), tickets);
    notifyBot('ticket-action', { guildId, channelId, action, value });
    return res.json({ ok: true });
  }
  if (action === 'set-typing') {
    ticket.canType = !!value;
    writeJSON(ticketsPath(guildId), tickets);
    notifyBot('ticket-action', { guildId, channelId, action, value });
    return res.json({ ok: true });
  }
  if (action === 'approve') {
    ticket.status = 'approved';
    writeJSON(ticketsPath(guildId), tickets);
    notifyBot('ticket-action', { guildId, channelId, action });
    return res.json({ ok: true });
  }
  if (action === 'reject') {
    ticket.status = 'rejected';
    writeJSON(ticketsPath(guildId), tickets);
    notifyBot('ticket-action', { guildId, channelId, action });
    return res.json({ ok: true });
  }
  if (action === 'close') {
    ticket.status = 'closed';
    writeJSON(ticketsPath(guildId), tickets);
    notifyBot('ticket-action', { guildId, channelId, action });
    return res.json({ ok: true });
  }
  if (action === 'clear-chat') {
    notifyBot('ticket-action', { guildId, channelId, action });
    return res.json({ ok: true });
  }
  if (action === 'send-message') {
    if (!value?.trim()) return res.status(400).json({ error: 'Empty message' });
    notifyBot('ticket-action', { guildId, channelId, action, value });
    return res.json({ ok: true });
  }
  if (action === 'new-ticket') {
    notifyBot('ticket-action', { guildId, channelId, action });
    return res.json({ ok: true });
  }

  res.status(400).json({ error: 'Unknown action' });
});

/* ===== OWNER ADMIN API (server-validated, OWNER_ID only) ===== */

// Lets the frontend know whether to show the admin nav link — NOT a security boundary
app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ isOwner: !!OWNER_ID && req.user.id === OWNER_ID });
});

// List of known users derived from stored tickets across every guild —
// lets you search by username instead of typing a raw Discord ID
app.get('/api/admin/users', requireOwner, (req, res) => {
  const usersMap = new Map();
  listGuildIds().forEach(gid => {
    readJSON(ticketsPath(gid), []).forEach(t => {
      if (!t.userId) return;
      const entry = usersMap.get(t.userId) || {
        userId: t.userId,
        username: t.username || t.userId,
        ticketCount: 0,
        reportedCount: 0,
        lastSeen: 0,
      };
      entry.ticketCount++;
      if (t.reported) entry.reportedCount++;
      if (t.username) entry.username = t.username; // keep most recent
      if ((t.openedAt || 0) > entry.lastSeen) entry.lastSeen = t.openedAt || 0;
      usersMap.set(t.userId, entry);
    });
  });
  const bans = readJSON(globalBansPath(), []);
  const users = [...usersMap.values()].map(u => ({
    ...u,
    banned: bans.some(b => b.userId === u.userId && (!b.expiresAt || b.expiresAt > Date.now())),
  })).sort((a, b) => b.lastSeen - a.lastSeen);
  res.json(users);
});

// All currently active bans, so you don't have to search one ID at a time
app.get('/api/admin/bans', requireOwner, (req, res) => {
  const bans = readJSON(globalBansPath(), [])
    .filter(b => !b.expiresAt || b.expiresAt > Date.now());
  res.json(bans);
});

// General stats for the top of the admin panel
app.get('/api/admin/stats', requireOwner, (req, res) => {
  const guildIds = listGuildIds();
  let totalTickets = 0, reported = 0;
  const usersSet = new Set();
  guildIds.forEach(gid => {
    readJSON(ticketsPath(gid), []).forEach(t => {
      totalTickets++;
      if (t.reported) reported++;
      if (t.userId) usersSet.add(t.userId);
    });
  });
  const bans = readJSON(globalBansPath(), []).filter(b => !b.expiresAt || b.expiresAt > Date.now());
  res.json({
    guilds: guildIds.length,
    totalTickets,
    reported,
    uniqueUsers: usersSet.size,
    activeBans: bans.length,
  });
});

// Search a single user: their tickets across every guild + current ban status
app.get('/api/admin/users/:userId', requireOwner, (req, res) => {
  const { userId } = req.params;
  const tickets = [];
  listGuildIds().forEach(gid => {
    readJSON(ticketsPath(gid), [])
      .filter(t => t.userId === userId)
      .forEach(t => tickets.push({ guildId: gid, ...t }));
  });
  const bans = readJSON(globalBansPath(), []);
  const ban = bans.find(b => b.userId === userId) || null;
  res.json({ userId, tickets, ban });
});

// Permanently delete everything stored about a user (all guilds)
app.delete('/api/admin/users/:userId', requireOwner, (req, res) => {
  const { userId } = req.params;
  const reason = req.body?.reason || '';
  let removed = 0;
  listGuildIds().forEach(gid => {
    const all = readJSON(ticketsPath(gid), []);
    const filtered = all.filter(t => t.userId !== userId);
    removed += all.length - filtered.length;
    if (filtered.length !== all.length) writeJSON(ticketsPath(gid), filtered);
  });
  logAdminAction(req.user.id, 'delete-user-data', userId, reason, { removedTickets: removed });
  res.json({ ok: true, removedTickets: removed });
});

// Ban (temporary if durationMs provided, permanent if not)
app.post('/api/admin/users/:userId/ban', requireOwner, (req, res) => {
  const { userId } = req.params;
  const { reason, durationMs } = req.body || {};
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason is required' });
  const bans = readJSON(globalBansPath(), []).filter(b => b.userId !== userId);
  const ban = {
    userId,
    reason: reason.trim(),
    bannedBy: req.user.id,
    bannedAt: Date.now(),
    expiresAt: durationMs ? Date.now() + Number(durationMs) : null,
  };
  bans.push(ban);
  writeJSON(globalBansPath(), bans);
  logAdminAction(req.user.id, ban.expiresAt ? 'temp-ban' : 'permanent-ban', userId, reason, { expiresAt: ban.expiresAt });
  notifyBot('global-ban-update', {}); // wakes the bot's poller sooner, harmless no-op otherwise
  res.json({ ok: true, ban });
});

app.post('/api/admin/users/:userId/unban', requireOwner, (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body || {};
  const bans = readJSON(globalBansPath(), []).filter(b => b.userId !== userId);
  writeJSON(globalBansPath(), bans);
  logAdminAction(req.user.id, 'unban', userId, reason);
  notifyBot('global-ban-update', {});
  res.json({ ok: true });
});

app.get('/api/admin/logs', requireOwner, (req, res) => {
  res.json(readJSON(adminLogPath(), []));
});

// Internal — used only by the bot process to read the current ban list
app.get('/internal/global-bans', (req, res) => res.json(readJSON(globalBansPath(), [])));


/* ===== AUTH ===== */
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback', (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    console.error("ERROR:", err);
    console.error("INFO:", info);

    if (err) return next(err);
    if (!user) return res.status(401).json(info);

    req.logIn(user, err => {
      if (err) return next(err);
      return res.redirect("/dashboard");
    });
  })(req, res, next);
});
app.get('/auth/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

/* ===== PAGES ===== */
app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/admin', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/server/:id', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'server.html'));
});
app.get('/admin', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));