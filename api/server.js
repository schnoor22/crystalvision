/**
 * Crystal Vision Co. — API Server
 *
 * Public routes:
 *   GET  /api/health
 *   GET  /api/content          — site editable content (JSON)
 *   POST /api/quote            — quote form submission
 *   POST /api/track            — page view tracking
 *
 * Admin routes (require Bearer token):
 *   POST /api/admin/login
 *   GET  /api/admin/verify
 *   GET  /api/admin/content
 *   PUT  /api/admin/content
 *   GET  /api/admin/stats
 *   GET  /api/admin/quotes
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const Database  = require('better-sqlite3');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ─── Config ─────────────────────────────────────────────────

const PORT           = process.env.PORT           || 3000;
const OWNER_EMAIL    = process.env.OWNER_EMAIL    || 'owner@crystalvisionco.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

// ─── Database ───────────────────────────────────────────────

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'site.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    message    TEXT,
    ip         TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT,
    referrer   TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertQuote = db.prepare('INSERT INTO quotes (name, phone, message, ip) VALUES (?, ?, ?, ?)');
const insertView  = db.prepare('INSERT INTO page_views (ip, referrer, user_agent) VALUES (?, ?, ?)');

// ─── Content File ────────────────────────────────────────────

const CONTENT_FILE = path.join(dataDir, 'content.json');

function readContent() {
  try {
    return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  } catch {
    const defaults = getDefaultContent();
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(defaults, null, 2), 'utf8');
    return defaults;
  }
}

function writeContent(data) {
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getDefaultContent() {
  return {
    hero: {
      heading1: 'Let the sunshine',
      heading2: 'back in',
      subtitle: 'Professional window cleaning that makes your world a little brighter. Locally owned, detail-obsessed, streak-free guaranteed.',
      ctaPrimary: 'Get Your Free Quote',
      ctaSecondary: 'View Services',
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
      instagramUrl: 'https://www.instagram.com/crystalvisionusa/',
      payInvoiceUrl: '#',
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
const quoteLimiter = rateLimit({ windowMs: 3_600_000, max: 5,  message: { error: 'Too many quote requests. Please try again later.' } });
const loginLimiter = rateLimit({ windowMs:   900_000, max: 10, message: { error: 'Too many login attempts. Please wait.' } });
const trackLimiter = rateLimit({ windowMs:    60_000, max: 30, message: { error: 'Too many tracking requests.' } });

// ─── Public Routes ───────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve editable site content
app.get('/api/content', (_req, res) => {
  res.json(readContent());
});

// Track a page view
app.post('/api/track', trackLimiter, (req, res) => {
  const ip       = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().substring(0, 100);
  const referrer = (req.body?.referrer   || '').substring(0, 500);
  const ua       = (req.body?.userAgent  || '').substring(0, 300);
  insertView.run(ip, referrer, ua);
  res.json({ ok: true });
});

// Quote submission
app.post('/api/quote', quoteLimiter, async (req, res) => {
  try {
    const { name, phone, message } = req.body;

    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: 'Name is required.' });
    if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10)
      return res.status(400).json({ error: 'Valid phone number is required.' });

    const cleanName    = name.trim().substring(0, 200);
    const cleanPhone   = phone.trim().substring(0, 30);
    const cleanMessage = (message || '').trim().substring(0, 2000);
    const ip           = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

    const result = insertQuote.run(cleanName, cleanPhone, cleanMessage, ip);

    if (RESEND_API_KEY) {
      sendEmailNotification(cleanName, cleanPhone, cleanMessage).catch(e =>
        console.error('Email failed:', e.message)
      );
    } else {
      console.log(`[QUOTE] ${cleanName} (${cleanPhone}): ${cleanMessage || '(no message)'}`);
    }

    res.json({ success: true, message: "Quote request received! We'll be in touch shortly.", id: result.lastInsertRowid });
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─── Admin Routes ────────────────────────────────────────────

// Login
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Invalid password.' });
  res.json({ token: createToken() });
});

// Verify token
app.get('/api/admin/verify', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

// Get content
app.get('/api/admin/content', requireAuth, (_req, res) => {
  res.json(readContent());
});

// Update content
app.put('/api/admin/content', requireAuth, (req, res) => {
  try {
    writeContent(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('Content save error:', err);
    res.status(500).json({ error: 'Failed to save content.' });
  }
});

// Stats dashboard
app.get('/api/admin/stats', requireAuth, (_req, res) => {
  const stats = {
    views30d:          db.prepare(`SELECT COUNT(*) as n      FROM page_views WHERE created_at >= datetime('now', '-30 days')`).get().n,
    viewsToday:        db.prepare(`SELECT COUNT(*) as n      FROM page_views WHERE date(created_at) = date('now')`).get().n,
    uniqueVisitors30d: db.prepare(`SELECT COUNT(DISTINCT ip) as n FROM page_views WHERE created_at >= datetime('now', '-30 days')`).get().n,
    totalQuotes:       db.prepare(`SELECT COUNT(*) as n      FROM quotes`).get().n,
    quotesThisWeek:    db.prepare(`SELECT COUNT(*) as n      FROM quotes WHERE created_at >= datetime('now', '-7 days')`).get().n,
    dailyViews:        db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as views
      FROM page_views
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY day ORDER BY day
    `).all(),
    topReferrers: db.prepare(`
      SELECT referrer, COUNT(*) as count
      FROM page_views
      WHERE referrer != ''
        AND referrer NOT LIKE '%crystalvision%'
        AND referrer NOT LIKE '%localhost%'
        AND created_at >= datetime('now', '-30 days')
      GROUP BY referrer ORDER BY count DESC LIMIT 8
    `).all(),
    recentQuotes: db.prepare(`
      SELECT id, name, phone, message, created_at
      FROM quotes ORDER BY created_at DESC LIMIT 5
    `).all(),
  };
  res.json(stats);
});

// Full quotes list
app.get('/api/admin/quotes', requireAuth, (_req, res) => {
  const quotes = db.prepare(`
    SELECT id, name, phone, message, created_at
    FROM quotes ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json(quotes);
});

// ─── Email ───────────────────────────────────────────────────

async function sendEmailNotification(name, phone, message) {
  const { Resend } = require('resend');
  const resend = new Resend(RESEND_API_KEY);
  await resend.emails.send({
    from: 'Crystal Vision Co. <quotes@crystalvisionco.com>',
    to: [OWNER_EMAIL],
    subject: `New Quote Request from ${name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#012A4A">New Quote Request</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;font-weight:bold;color:#475569">Name:</td><td>${esc(name)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;color:#475569">Phone:</td><td><a href="tel:${phone}">${esc(phone)}</a></td></tr>
          ${message ? `<tr><td style="padding:8px 0;font-weight:bold;color:#475569;vertical-align:top">Message:</td><td>${esc(message)}</td></tr>` : ''}
        </table>
        <hr style="border:1px solid #e2e8f0;margin:20px 0"/>
        <p style="color:#94a3b8;font-size:12px">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</p>
      </div>`,
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Start ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nCrystal Vision API  →  http://localhost:${PORT}`);
  console.log(`  Admin password: ${ADMIN_PASSWORD === 'changeme123' ? '⚠️  DEFAULT — set ADMIN_PASSWORD in .env' : '✓ set'}`);
  console.log(`  Email notifications: ${RESEND_API_KEY ? '✓ enabled' : 'disabled (set RESEND_API_KEY)'}\n`);
});

process.on('SIGINT',  () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
