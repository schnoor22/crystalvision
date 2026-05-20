'use strict';
/**
 * Crystal Vision Co. — API Server
 * Runs as a Vercel serverless function (api/index.js re-exports this app).
 * Also works standalone: `node server.js` for local development.
 *
 * Database  : Turso (libsql) — set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 *             Local dev fallback: TURSO_DATABASE_URL=file:local.db (no token needed)
 * Images    : Vercel Blob — BLOB_READ_WRITE_TOKEN is auto-set by Vercel
 * Email     : Resend — RESEND_API_KEY
 *
 * Public routes:
 *   GET  /api/health
 *   GET  /api/content
 *   POST /api/quote
 *   POST /api/track
 *   GET  /api/portfolio
 *
 * Admin routes (require Bearer token):
 *   POST   /api/admin/login
 *   GET    /api/admin/verify
 *   GET    /api/admin/content
 *   PUT    /api/admin/content
 *   GET    /api/admin/stats
 *   GET    /api/admin/quotes
 *   POST   /api/admin/portfolio
 *   PATCH  /api/admin/portfolio/:id
 *   DELETE /api/admin/portfolio/:id
 *   POST   /api/admin/hero-image
 *   DELETE /api/admin/hero-image
 */

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@libsql/client');
const { put, del }     = require('@vercel/blob');
const crypto = require('crypto');
const multer = require('multer');

let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

// ─── Config ──────────────────────────────────────────────────

const PORT           = process.env.PORT           || 3000;
const OWNER_EMAIL    = process.env.OWNER_EMAIL    || 'info@crystalvisionusa.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

// ─── Database (Turso / libsql) ────────────────────────────────

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Run schema migrations once per cold start (idempotent CREATE IF NOT EXISTS)
const dbReady = db.batch([
  `CREATE TABLE IF NOT EXISTS quotes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    message    TEXT,
    address    TEXT DEFAULT '',
    source     TEXT DEFAULT '',
    ip         TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS page_views (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT,
    referrer   TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS portfolio (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL,
    caption    TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    featured   INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`,
], 'write').catch(err => console.error('DB init error:', err));

// Migrate existing tables (ALTER TABLE silently ignored if column already exists)
const dbMigrations = dbReady.then(() => Promise.all([
  db.execute('ALTER TABLE quotes ADD COLUMN address TEXT DEFAULT ""').catch(() => {}),
  db.execute('ALTER TABLE quotes ADD COLUMN source  TEXT DEFAULT ""').catch(() => {}),
  db.execute('ALTER TABLE portfolio ADD COLUMN featured INTEGER DEFAULT 0').catch(() => {}),
])).catch(err => console.error('DB migration error:', err));

// ─── Content (stored in Turso settings table) ─────────────────

async function readContent() {
  await dbReady;
  const result = await db.execute("SELECT value FROM settings WHERE key = 'content'");
  if (result.rows.length > 0) return JSON.parse(result.rows[0].value);
  const defaults = getDefaultContent();
  await writeContent(defaults);
  return defaults;
}

async function writeContent(data) {
  await dbReady;
  await db.execute({
    sql:  "INSERT OR REPLACE INTO settings (key, value) VALUES ('content', ?)",
    args: [JSON.stringify(data)],
  });
}

// ─── Multer (memory storage only — no persistent disk on Vercel) ──
// Vercel free tier enforces a 4.5 MB request body limit.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only (jpeg, png, webp, gif)'));
  },
});

const heroUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only (jpeg, png, webp)'));
  },
});

function getDefaultContent() {
  return {
    hero: {
      heading1: 'Let the sunshine',
      heading2: 'back in',
      subtitle: 'Professional window cleaning that makes your world a little brighter. Locally owned, detail-obsessed, streak-free guaranteed.',
      ctaPrimary: 'Get Your Free Quote',
      ctaSecondary: 'View Services',
      backgroundUrl: '/background.jpg',
    },
    about: {
      title: 'Your New Favorite Window Cleaner',
      body1: 'We believe clean windows do more than improve appearance \u2014 they brighten homes, businesses, and the world outside.',
      body2: "We're a locally owned window cleaning company with reliable, detail-focused service you can count on. Our goal is simple: deliver spotless, streak-free windows while providing an easy, stress-free experience from start to finish.",
      trust1Title: 'Streak-Free',
      trust1Body: 'Guaranteed spotless results every time',
      trust2Title: 'Fully Insured',
      trust2Body: 'Licensed, bonded & insured for your protection',
      trust3Title: 'On Time',
      trust3Body: 'Reliable scheduling that fits your life',
    },
    services: {
      intro: "From sparkling home windows to full commercial buildings \u2014 we've got you covered.",
      residential: {
        title: 'Residential Window Cleaning',
        short: 'Eye-level perfection for every window in your home. Traditional tools, no shortcuts, no inflated pricing.',
        full:  "Our main gig. We get eye level with your windows and clean them using traditional equipment to ensure perfection. We will never take shortcuts and we won't jack up the price for it, either.",
      },
      screenRepair: {
        title: 'Window Screen Repair',
        short: 'Damaged screens restored to brand new. Choose from five premium screen materials.',
        full:  'Our most specialized and technical skill! We take your damaged window screens home and reinstall them looking brand new. We also allow you to pick from our premium screen materials.',
      },
      commercial: {
        title: 'Commercial Window Cleaning',
        short: 'Tailored to your business schedule \u2014 done before doors open. Biweekly plans available.',
        full:  'Designed to fit the needs and schedule of your business. Typically, we start our commercial cleanings at 5AM and finish before customers arrive at your business! Most of our commercial customers sign up for biweekly cleanings.',
      },
    },
    cta: {
      title: 'Ready for crystal clear windows?',
      subtitle: "Get a free, no-pressure quote in minutes. We'll take it from there.",
    },
    business: {
      name: 'Crystal Vision Co.',
      phone: '(503) 545-4706',
      phoneUrl: 'tel:+15035454706',
      email: 'info@crystalvisionusa.com',
      instagramUrl: 'https://www.instagram.com/crystalvisionusa/',
      payInvoiceUrl: 'https://venmo.com/u/Kidschmid',
    },
  };
}

// ─── Auth (HMAC token, no extra packages needed) ─────────────

function createToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 86400000 })).toString('base64url');
  const sig     = crypto.createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  try {
    const [payload, sig] = (token || '').split('.');
    if (!payload || !sig) return false;
    const expected = crypto.createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('base64url');
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now();
  } catch { return false; }
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ─── Express App ─────────────────────────────────────────────

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '200kb' }));

// Rate limiters
// Rate limiters
// NOTE: In-memory state resets per serverless cold start.
// For strict enforcement swap the store for Upstash Redis.
const quoteLimiter = rateLimit({ windowMs: 3_600_000, max: 5,  message: { error: 'Too many quote requests. Please try again later.' } });
const loginLimiter = rateLimit({ windowMs:   900_000, max: 10, message: { error: 'Too many login attempts. Please wait.' } });
const trackLimiter = rateLimit({ windowMs:    60_000, max: 30, message: { error: 'Too many tracking requests.' } });

// ─── Public Routes ───────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/content', async (_req, res) => {
  try {
    res.json(await readContent());
  } catch (err) {
    console.error('Content read error:', err);
    res.status(500).json({ error: 'Failed to load content.' });
  }
});

app.post('/api/track', trackLimiter, async (req, res) => {
  try {
    await dbReady;
    const ip       = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().substring(0, 100);
    const referrer = (req.body?.referrer  || '').substring(0, 500);
    const ua       = (req.body?.userAgent || '').substring(0, 300);
    await db.execute({
      sql:  'INSERT INTO page_views (ip, referrer, user_agent) VALUES (?, ?, ?)',
      args: [ip, referrer, ua],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Track error:', err);
    res.json({ ok: true }); // never block the visitor
  }
});

app.post('/api/quote', quoteLimiter, async (req, res) => {
  try {
    await dbMigrations;
    const { name, phone, message, address, source } = req.body;

    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: 'Name is required.' });
    if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10)
      return res.status(400).json({ error: 'Valid phone number is required.' });

    const cleanName    = name.trim().substring(0, 200);
    const cleanPhone   = phone.trim().substring(0, 30);
    const cleanMessage = (message || '').trim().substring(0, 2000);
    const cleanAddress = (address || '').trim().substring(0, 300);
    const cleanSource  = (source  || '').trim().substring(0, 100);
    const ip           = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

    const result = await db.execute({
      sql:  'INSERT INTO quotes (name, phone, message, address, source, ip) VALUES (?, ?, ?, ?, ?, ?)',
      args: [cleanName, cleanPhone, cleanMessage, cleanAddress, cleanSource, ip],
    });

    if (RESEND_API_KEY) {
      sendEmailNotification(cleanName, cleanPhone, cleanMessage, cleanAddress, cleanSource).catch(e =>
        console.error('Email failed:', e.message)
      );
    } else {
      console.log(`[QUOTE] ${cleanName} (${cleanPhone}): ${cleanMessage || '(no message)'}`);
    }

    res.json({ success: true, message: "Quote request received! We'll be in touch shortly.", id: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─── Admin Routes ────────────────────────────────────────────

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Invalid password.' });
  res.json({ token: createToken() });
});

app.get('/api/admin/verify', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/content', requireAuth, async (_req, res) => {
  try {
    res.json(await readContent());
  } catch (err) {
    console.error('Content read error:', err);
    res.status(500).json({ error: 'Failed to load content.' });
  }
});

app.put('/api/admin/content', requireAuth, async (req, res) => {
  try {
    await writeContent(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('Content save error:', err);
    res.status(500).json({ error: 'Failed to save content.' });
  }
});

app.get('/api/admin/stats', requireAuth, async (_req, res) => {
  try {
    await dbReady;
    const [
      views30d, viewsToday, uniqueVisitors30d,
      totalQuotes, quotesThisWeek,
      dailyViewsResult, topReferrersResult, recentQuotesResult,
    ] = await Promise.all([
      db.execute(`SELECT COUNT(*) as n FROM page_views WHERE created_at >= datetime('now', '-30 days')`),
      db.execute(`SELECT COUNT(*) as n FROM page_views WHERE date(created_at) = date('now')`),
      db.execute(`SELECT COUNT(DISTINCT ip) as n FROM page_views WHERE created_at >= datetime('now', '-30 days')`),
      db.execute(`SELECT COUNT(*) as n FROM quotes`),
      db.execute(`SELECT COUNT(*) as n FROM quotes WHERE created_at >= datetime('now', '-7 days')`),
      db.execute(`
        SELECT date(created_at) as day, COUNT(*) as views
        FROM page_views
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY day ORDER BY day
      `),
      db.execute(`
        SELECT referrer, COUNT(*) as count
        FROM page_views
        WHERE referrer != ''
          AND referrer NOT LIKE '%crystalvision%'
          AND referrer NOT LIKE '%localhost%'
          AND created_at >= datetime('now', '-30 days')
        GROUP BY referrer ORDER BY count DESC LIMIT 8
      `),
      db.execute(`
        SELECT id, name, phone, message, created_at
        FROM quotes ORDER BY created_at DESC LIMIT 5
      `),
    ]);

    res.json({
      views30d:          Number(views30d.rows[0]?.n          ?? 0),
      viewsToday:        Number(viewsToday.rows[0]?.n        ?? 0),
      uniqueVisitors30d: Number(uniqueVisitors30d.rows[0]?.n ?? 0),
      totalQuotes:       Number(totalQuotes.rows[0]?.n       ?? 0),
      quotesThisWeek:    Number(quotesThisWeek.rows[0]?.n    ?? 0),
      dailyViews:        dailyViewsResult.rows,
      topReferrers:      topReferrersResult.rows,
      recentQuotes:      recentQuotesResult.rows,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

app.get('/api/admin/reviews', requireAuth, async (_req, res) => {
  try {
    await dbReady;
    const result = await db.execute("SELECT value FROM settings WHERE key = 'reviews'");
    res.json(result.rows.length ? JSON.parse(result.rows[0].value) : []);
  } catch (err) {
    console.error('Reviews read error:', err);
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

app.put('/api/admin/reviews', requireAuth, async (req, res) => {
  try {
    await dbReady;
    const reviews = (req.body || []).slice(0, 3).map(r => ({
      name:     (r.name  || '').substring(0, 100),
      rating:   Math.min(5, Math.max(1, parseInt(r.rating) || 5)),
      text:     (r.text  || '').substring(0, 1000),
      date:     (r.date  || '').substring(0, 50),
    }));
    await db.execute({
      sql:  "INSERT OR REPLACE INTO settings (key, value) VALUES ('reviews', ?)",
      args: [JSON.stringify(reviews)],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Reviews save error:', err);
    res.status(500).json({ error: 'Failed to save reviews.' });
  }
});

app.get('/api/admin/quotes', requireAuth, async (_req, res) => {
  try {
    await dbReady;
    const result = await db.execute(`
      SELECT id, name, phone, message, address, source, created_at
      FROM quotes ORDER BY created_at DESC LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Quotes error:', err);
    res.status(500).json({ error: 'Failed to load quotes.' });
  }
});

// ─── Portfolio Routes ─────────────────────────────────────────
// `filename` column stores the full Vercel Blob CDN URL.

app.get('/api/portfolio', async (_req, res) => {
  try {
    await dbReady;
    const result = await db.execute(
      'SELECT id, filename, caption, featured FROM portfolio ORDER BY sort_order ASC, id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ error: 'Failed to load portfolio.' });
  }
});

app.get('/api/gallery', async (_req, res) => {
  try {
    await dbMigrations;
    const result = await db.execute(
      'SELECT id, filename, caption FROM portfolio WHERE featured = 1 ORDER BY sort_order ASC, id DESC LIMIT 10'
    );
    // Fall back to first 10 portfolio items if none are marked featured
    if (result.rows.length === 0) {
      const fallback = await db.execute(
        'SELECT id, filename, caption FROM portfolio ORDER BY sort_order ASC, id DESC LIMIT 10'
      );
      return res.json(fallback.rows);
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Gallery error:', err);
    res.status(500).json({ error: 'Failed to load gallery.' });
  }
});

app.get('/api/reviews', async (_req, res) => {
  try {
    await dbReady;
    const result = await db.execute("SELECT value FROM settings WHERE key = 'reviews'");
    if (!result.rows.length) return res.json([]);
    res.json(JSON.parse(result.rows[0].value));
  } catch (err) {
    console.error('Reviews error:', err);
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

app.post('/api/admin/portfolio', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  try {
    await dbReady;
    const ext      = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const blobName = `portfolio/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const { url }  = await put(blobName, req.file.buffer, { access: 'public', contentType: req.file.mimetype });
    const caption    = (req.body.caption    || '').substring(0, 200);
    const sort_order = parseInt(req.body.sort_order) || 0;
    const result = await db.execute({
      sql:  'INSERT INTO portfolio (filename, caption, sort_order) VALUES (?, ?, ?)',
      args: [url, caption, sort_order],
    });
    res.json({ ok: true, id: Number(result.lastInsertRowid), filename: url });
  } catch (err) {
    console.error('Portfolio upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

app.patch('/api/admin/portfolio/:id', requireAuth, async (req, res) => {
  try {
    await dbMigrations;
    const { caption = '', sort_order = 0, featured } = req.body;
    if (featured !== undefined) {
      await db.execute({
        sql:  'UPDATE portfolio SET caption = ?, sort_order = ?, featured = ? WHERE id = ?',
        args: [caption.substring(0, 200), parseInt(sort_order) || 0, featured ? 1 : 0, Number(req.params.id)],
      });
    } else {
      await db.execute({
        sql:  'UPDATE portfolio SET caption = ?, sort_order = ? WHERE id = ?',
        args: [caption.substring(0, 200), parseInt(sort_order) || 0, Number(req.params.id)],
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Portfolio update error:', err);
    res.status(500).json({ error: 'Update failed.' });
  }
});

app.delete('/api/admin/portfolio/:id', requireAuth, async (req, res) => {
  try {
    await dbReady;
    const result = await db.execute({
      sql:  'SELECT filename FROM portfolio WHERE id = ?',
      args: [Number(req.params.id)],
    });
    if (!result.rows.length) return res.status(404).json({ error: 'Not found.' });
    const blobUrl = result.rows[0].filename;
    try { await del(blobUrl); } catch { /* blob may already be gone */ }
    await db.execute({ sql: 'DELETE FROM portfolio WHERE id = ?', args: [Number(req.params.id)] });
    res.json({ ok: true });
  } catch (err) {
    console.error('Portfolio delete error:', err);
    res.status(500).json({ error: 'Delete failed.' });
  }
});

// ─── Hero Background Image Routes ────────────────────────────

app.post('/api/admin/hero-image', requireAuth, heroUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    let imageBuffer = req.file.buffer;
    let contentType = req.file.mimetype;
    if (sharp) {
      imageBuffer = await sharp(req.file.buffer)
        .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true })
        .toBuffer();
      contentType = 'image/jpeg';
    }
    const { url } = await put(`hero-bg-${Date.now()}.jpg`, imageBuffer, { access: 'public', contentType });
    const content = await readContent();
    if (!content.hero) content.hero = {};
    content.hero.backgroundUrl = url;
    await writeContent(content);
    res.json({ ok: true, url });
  } catch (err) {
    console.error('Hero image processing error:', err);
    res.status(500).json({ error: 'Image processing failed' });
  }
});

app.delete('/api/admin/hero-image', requireAuth, async (_req, res) => {
  try {
    const content = await readContent();
    if (content.hero) content.hero.backgroundUrl = '/background.jpg';
    await writeContent(content);
    res.json({ ok: true });
  } catch (err) {
    console.error('Hero image reset error:', err);
    res.status(500).json({ error: 'Reset failed.' });
  }
});

// ─── Email ───────────────────────────────────────────────────

async function sendEmailNotification(name, phone, message, address, source) {
  const { Resend } = require('resend');
  const resend = new Resend(RESEND_API_KEY);
  await resend.emails.send({
    from: 'Crystal Vision Co. <quotes@crystalvisionusa.com>',
    to: [OWNER_EMAIL],
    subject: `New Quote Request from ${name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#012A4A">New Quote Request</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;font-weight:bold;color:#475569">Name:</td><td>${esc(name)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;color:#475569">Phone:</td><td><a href="tel:${phone}">${esc(phone)}</a></td></tr>
          ${address ? `<tr><td style="padding:8px 0;font-weight:bold;color:#475569">Address:</td><td>${esc(address)}</td></tr>` : ''}
          ${message ? `<tr><td style="padding:8px 0;font-weight:bold;color:#475569;vertical-align:top">Message:</td><td>${esc(message)}</td></tr>` : ''}
          ${source ? `<tr><td style="padding:8px 0;font-weight:bold;color:#475569">Heard via:</td><td>${esc(source)}</td></tr>` : ''}
        </table>
        <hr style="border:1px solid #e2e8f0;margin:20px 0"/>
        <p style="color:#94a3b8;font-size:12px">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</p>
      </div>`,
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Entry Point ─────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nCrystal Vision API  →  http://localhost:${PORT}`);
    console.log(`  Admin password: ${ADMIN_PASSWORD === 'changeme123' ? '⚠️  DEFAULT — set ADMIN_PASSWORD in .env' : '✓ set'}`);
    console.log(`  Email notifications: ${RESEND_API_KEY ? '✓ enabled' : 'disabled (set RESEND_API_KEY)'}\n`);
  });

  process.on('SIGINT',  () => { db.close(); process.exit(0); });
  process.on('SIGTERM', () => { db.close(); process.exit(0); });
}

module.exports = app;
