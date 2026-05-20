/**
 * migrate-to-turso.js
 * Full production migration from the old Linux server to Vercel + Turso.
 *
 * Migrates:
 *   ✓ Quotes (SQLite → Turso)
 *   ✓ Page views (SQLite → Turso)
 *   ✓ Site content / wording (content.json → Turso settings table)
 *   ✓ Portfolio images (disk files → Vercel Blob → Turso portfolio table)
 *   ✓ Hero background image (disk file → Vercel Blob → Turso settings)
 *
 * ─── STEP 1: Copy everything from the Linux server ───────────────────
 *
 *   # Run this in PowerShell (replace user/host/path as needed)
 *   scp -r user@your-server:/path/to/crystalvisionusa/api/data ./server-data
 *
 *   That copies the whole data folder, giving you locally:
 *     server-data/site.db          ← SQLite database
 *     server-data/content.json     ← all wording / settings
 *     server-data/hero-bg.jpg      ← hero photo (if customised)
 *     server-data/portfolio/       ← all portfolio images
 *
 * ─── STEP 2: Set up Turso ────────────────────────────────────────────
 *   1. Sign up at https://turso.tech
 *   2. Create a database named "crystalvision"
 *   3. Copy the libsql:// URL and an auth token
 *
 * ─── STEP 3: Set up Vercel Blob ──────────────────────────────────────
 *   1. Create your Vercel project (import from GitHub)
 *   2. Go to Storage → Create → Blob store → link to project
 *   3. In the Blob store settings, create a Read/Write token
 *      (or run: vercel env pull .env.local  after installing Vercel CLI)
 *
 * ─── STEP 4: Run this script ─────────────────────────────────────────
 *
 *   $env:TURSO_DATABASE_URL    = "libsql://crystalvision-xxx.turso.io"
 *   $env:TURSO_AUTH_TOKEN      = "your-turso-token"
 *   $env:BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_..."
 *
 *   node scripts/migrate-to-turso.js ./server-data
 *
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { put }          = require('@vercel/blob');

async function main() {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('Usage: node scripts/migrate-to-turso.js <path-to-server-data-folder>');
    console.error('  e.g. node scripts/migrate-to-turso.js ./server-data');
    process.exit(1);
  }

  const abs = p => path.resolve(dataDir, p);

  // ── Validate env vars ───────────────────────────────────────────────
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, BLOB_READ_WRITE_TOKEN } = process.env;
  if (!TURSO_DATABASE_URL || TURSO_DATABASE_URL.startsWith('file:')) {
    console.error('ERROR: Set TURSO_DATABASE_URL to your remote libsql:// URL');
    process.exit(1);
  }
  if (!BLOB_READ_WRITE_TOKEN) {
    console.error('ERROR: Set BLOB_READ_WRITE_TOKEN (from Vercel Blob store settings)');
    process.exit(1);
  }

  console.log('\n── Crystal Vision: Full Production Migration ─────────────────\n');

  // ── Connect to Turso ────────────────────────────────────────────────
  const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

  // Create all tables
  await db.batch([
    `CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT NOT NULL,
      message TEXT, ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT, referrer TEXT, user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL, caption TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT
    )`,
  ], 'write');

  // ── 1. Migrate SQLite → Turso ───────────────────────────────────────
  // Skip if data already exists in Turso (e.g. file was uploaded via dashboard)
  const existingCount = (await db.execute('SELECT COUNT(*) as n FROM quotes')).rows[0][0];
  const dbFile = ['site.db', 'quotes.db'].map(abs).find(f => fs.existsSync(f));
  if (dbFile && existingCount > 0) {
    console.log(`[1/4] Skipping — Turso already has ${existingCount} quotes (uploaded via dashboard)`);
  } else if (dbFile) {
    console.log(`[1/4] Migrating database: ${path.basename(dbFile)}`);
    const src    = createClient({ url: `file:${dbFile}` });
    const quotes = (await src.execute('SELECT name, phone, message, ip, created_at FROM quotes ORDER BY id')).rows;
    const views  = (await src.execute('SELECT ip, referrer, user_agent, created_at FROM page_views ORDER BY id')).rows;
    await src.close();

    let qCount = 0;
    for (const q of quotes) {
      await db.execute({
        sql:  'INSERT INTO quotes (name, phone, message, ip, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [q.name, q.phone, q.message || '', q.ip || '', q.created_at],
      });
      process.stdout.write(`\r     Quotes: ${++qCount}/${quotes.length}`);
    }
    if (qCount) console.log();

    let vCount = 0;
    for (const v of views) {
      await db.execute({
        sql:  'INSERT INTO page_views (ip, referrer, user_agent, created_at) VALUES (?, ?, ?, ?)',
        args: [v.ip || '', v.referrer || '', v.user_agent || '', v.created_at],
      });
      process.stdout.write(`\r     Page views: ${++vCount}/${views.length}`);
    }
    if (vCount) console.log();
    console.log(`     ✓ ${qCount} quotes, ${vCount} page views migrated`);
  } else {
    console.log('[1/4] No database file found — skipping');
  }

  // ── 2. Migrate content.json → Turso settings ────────────────────────
  console.log('\n[2/4] Migrating site content (wording, settings)...');
  const contentFile = abs('content.json');
  if (fs.existsSync(contentFile)) {
    const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

    // Hero bg may be updated later by step 4 — save placeholder first
    await db.execute({
      sql:  "INSERT OR REPLACE INTO settings (key, value) VALUES ('content', ?)",
      args: [JSON.stringify(content)],
    });
    console.log('     ✓ content.json saved to Turso');
  } else {
    console.log('     No content.json found — default content will be used');
  }

  // ── 3. Upload portfolio images → Vercel Blob → Turso ────────────────
  console.log('\n[3/4] Uploading portfolio images to Vercel Blob...');
  const portfolioDir = abs('portfolio');
  if (fs.existsSync(portfolioDir)) {
    const imageFiles = fs.readdirSync(portfolioDir)
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .sort(); // sort by filename = preserve upload order

    if (imageFiles.length === 0) {
      console.log('     No portfolio images found');
    } else {
      // Clear any existing portfolio rows first
      await db.execute('DELETE FROM portfolio');
      let idx = 0;
      for (const filename of imageFiles) {
        const filePath    = path.join(portfolioDir, filename);
        const buffer      = fs.readFileSync(filePath);
        const ext         = path.extname(filename).slice(1).toLowerCase();
        const mimeMap     = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
        const contentType = mimeMap[ext] || 'image/jpeg';

        const { url } = await put(`portfolio/${filename}`, buffer, { access: 'public', contentType });
        await db.execute({
          sql:  'INSERT INTO portfolio (filename, caption, sort_order) VALUES (?, ?, ?)',
          args: [url, '', idx],
        });
        idx++;
        process.stdout.write(`\r     Uploaded ${idx}/${imageFiles.length}: ${filename}`);
      }
      console.log(`\n     ✓ ${idx} portfolio images uploaded`);
    }
  } else {
    console.log('     No portfolio folder found — skipping');
  }

  // ── 4. Upload hero background → Vercel Blob, update content ─────────
  console.log('\n[4/4] Uploading hero background image...');
  const heroBg = abs('hero-bg.jpg');
  if (fs.existsSync(heroBg)) {
    const buffer  = fs.readFileSync(heroBg);
    const { url } = await put(`hero-bg-migrated.jpg`, buffer, { access: 'public', contentType: 'image/jpeg' });

    // Update the backgroundUrl in the settings we already saved
    const existing = (await db.execute("SELECT value FROM settings WHERE key = 'content'")).rows[0];
    if (existing) {
      const content = JSON.parse(existing.value);
      if (!content.hero) content.hero = {};
      content.hero.backgroundUrl = url;
      await db.execute({
        sql:  "INSERT OR REPLACE INTO settings (key, value) VALUES ('content', ?)",
        args: [JSON.stringify(content)],
      });
    }
    console.log(`     ✓ Hero background uploaded: ${url}`);
  } else {
    console.log('     No hero-bg.jpg found — site will use default /background.jpg');
  }

  await db.close();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Migration complete! Everything is in Turso + Vercel Blob.');
  console.log('  You can now deploy to Vercel (push to GitHub → auto-deploy).');
  console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('\nFatal error:', err.message); process.exit(1); });

