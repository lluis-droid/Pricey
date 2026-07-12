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

function readJSON(file, def = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function configPath(id) { return path.join(DATA_DIR, `config_${id}.json`); }
function panelsPath(id) { return path.join(DATA_DIR, `panels_${id}.json`); }
function ticketsPath(id) { return path.join(DATA_DIR, `tickets_${id}.json`); }
function guildDataPath(id) { return path.join(DATA_DIR, `guilddata_${id}.json`); }
function bansPath() { return path.join(DATA_DIR, 'bans.json'); }
function adminLogPath() { return path.join(DATA_DIR, 'admin_log.json'); }

/* ===== OWNER / ADMIN ACCESS =====
   Set OWNER_IDS in .env to a comma-separated list of Discord user IDs, e.g.
     OWNER_IDS=123456789012345678,987654321098765432
   Only these accounts can reach /admin or any /api/admin/* endpoint. This is
   checked server-side on every request below — the dashboard link hiding
   itself client-side is a convenience only, never the real permission check. */
const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

function isOwner(user) {
  return !!user && OWNER_IDS.includes(user.id);
}

function requireOwner(req, res, next) {
  if (!req.isAuthenticated() || !isOwner(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function logAdminAction(admin, action, targetUserId, reason, details = {}) {
  const log = readJSON(adminLogPath(), []);
  log.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    adminId: admin.id,
    adminTag: admin.username,
    action,
    targetUserId,
    reason: (reason || '').trim() || null,
    details,
  });
  writeJSON(adminLogPath(), log.slice(0, 2000));
}

function allGuildIdsFromData() {
  const ids = new Set();
  try {
    fs.readdirSync(DATA_DIR).forEach(f => {
      const m = f.match(/^(?:config|panels|tickets|guilddata)_(\d+)\.json$/);
      if (m) ids.add(m[1]);
    });
  } catch {}
  return [...ids];
}

function getActiveBan(userId) {
  const bans = readJSON(bansPath(), []);
  const now = Date.now();
  return bans.find(b => b.userId === userId && b.active && (!b.expiresAt || b.expiresAt > now)) || null;
}

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
app.get('/internal/ban/:userId', (req, res) => {
  const ban = getActiveBan(req.params.userId);
  res.json({ banned: !!ban, ban });
});

/* ===== PUBLIC STATUS ===== */
app.get('/api/status', (req, res) => res.json(botStatus));

app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ loggedIn: false });
  const u = req.user;
  res.json({ loggedIn: true, user: { id: u.id, username: u.username, avatar: u.avatar, isOwner: isOwner(u) } });
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

/* ===== OWNER ADMIN API =====
   Everything below is gated by requireOwner. */
app.get('/api/admin/logs', requireOwner, (req, res) => {
  const log = readJSON(adminLogPath(), []);
  res.json(log.slice(0, 300));
});

app.get('/api/admin/bans', requireOwner, (req, res) => {
  const bans = readJSON(bansPath(), []);
  const now = Date.now();
  const withStatus = bans
    .map(b => ({ ...b, expired: !!(b.expiresAt && b.expiresAt <= now) }))
    .sort((a, b) => (b.bannedAt || 0) - (a.bannedAt || 0));
  res.json(withStatus);
});

app.get('/api/admin/user/:userId', requireOwner, (req, res) => {
  const userId = req.params.userId;
  const guildIds = allGuildIdsFromData();
  const tickets = [];
  const blacklistedIn = [];
  const guildsSeenIn = new Set();
  let lastKnownUsername = null;
  let lastSeenAt = 0;

  guildIds.forEach(gid => {
    const guildTickets = readJSON(ticketsPath(gid), []).filter(t => t.userId === userId);
    guildTickets.forEach(t => {
      tickets.push({ ...t, guildId: gid });
      guildsSeenIn.add(gid);
      if ((t.openedAt || 0) > lastSeenAt) { lastSeenAt = t.openedAt || 0; lastKnownUsername = t.username || lastKnownUsername; }
    });

    const config = readJSON(configPath(gid), {});
    const bl = (config.blacklist || []).find(b => b.userId === userId);
    if (bl) { blacklistedIn.push({ guildId: gid, ...bl }); guildsSeenIn.add(gid); }
  });

  tickets.sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));

  const log = readJSON(adminLogPath(), []);
  const actionHistory = log.filter(l => l.targetUserId === userId).slice(0, 100);

  res.json({
    userId,
    lastKnownUsername,
    guildsSeenIn: [...guildsSeenIn],
    tickets,
    blacklistedIn,
    ban: getActiveBan(userId),
    actionHistory,
  });
});

app.delete('/api/admin/user/:userId', requireOwner, (req, res) => {
  const userId = req.params.userId;
  const reason = req.body?.reason;
  const guildIds = allGuildIdsFromData();
  let removedTickets = 0;
  let removedFromBlacklists = 0;

  guildIds.forEach(gid => {
    const tickets = readJSON(ticketsPath(gid), []);
    const keptTickets = tickets.filter(t => t.userId !== userId);
    if (keptTickets.length !== tickets.length) {
      removedTickets += tickets.length - keptTickets.length;
      writeJSON(ticketsPath(gid), keptTickets);
    }

    const config = readJSON(configPath(gid), {});
    if (config.blacklist?.some(b => b.userId === userId)) {
      const keptBlacklist = config.blacklist.filter(b => b.userId !== userId);
      removedFromBlacklists += config.blacklist.length - keptBlacklist.length;
      config.blacklist = keptBlacklist;
      writeJSON(configPath(gid), config);
      notifyBot('config-update', { guildId: gid, config });
    }
  });

  logAdminAction(req.user, 'delete-user-data', userId, reason, { removedTickets, removedFromBlacklists });
  res.json({ ok: true, removedTickets, removedFromBlacklists });
});

app.post('/api/admin/user/:userId/ban', requireOwner, (req, res) => {
  const userId = req.params.userId;
  const { reason, durationDays } = req.body || {};
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required' });

  const bans = readJSON(bansPath(), []);
  bans.forEach(b => { if (b.userId === userId) b.active = false; });

  const days = Number(durationDays) || 0;
  const expiresAt = days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;

  bans.push({
    userId,
    reason: reason.trim(),
    bannedAt: Date.now(),
    bannedBy: req.user.id,
    bannedByTag: req.user.username,
    expiresAt,
    active: true,
  });
  writeJSON(bansPath(), bans);
  logAdminAction(req.user, expiresAt ? 'temp-ban' : 'perm-ban', userId, reason, { expiresAt });
  res.json({ ok: true });
});

app.post('/api/admin/user/:userId/unban', requireOwner, (req, res) => {
  const userId = req.params.userId;
  const reason = req.body?.reason;
  const bans = readJSON(bansPath(), []);
  let changed = false;
  bans.forEach(b => { if (b.userId === userId && b.active) { b.active = false; changed = true; } });
  writeJSON(bansPath(), bans);
  if (changed) logAdminAction(req.user, 'unban', userId, reason, {});
  res.json({ ok: true, changed });
});

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
app.get('/server/:id', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'server.html'));
});
app.get('/admin', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  if (!isOwner(req.user)) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));
