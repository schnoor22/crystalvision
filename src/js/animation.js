/**
 * First Light Window Cleaning — "First Light" intro
 *
 * The screen starts as fogged glass at dawn. The sun flare from the
 * logo ignites, its light burns the fog away outward, the wordmark
 * sharpens, and the overlay dissolves into the site.
 *
 *  - About 2.3s total, skippable (button, click, any key)
 *  - Plays once per browser session
 *  - Never plays with prefers-reduced-motion
 *  - The page is fully usable without JS (overlay hides itself via CSS)
 */

import { gsap } from 'gsap';

const SEEN_KEY = 'fl_intro_seen'; // also used by the inline script in index.html

// Sun position inside /logo-full.jpg (1169 x 809), as fractions
const SUN = { x: 585 / 1169, y: 325 / 809 };

const CFG = {
  ignite: 0.7,      // flare grows from a spark to full burst
  burn: 1.05,       // fog clears outward from the sun
  hold: 0.35,       // logo fully visible
  exit: 0.55,       // overlay dissolves into the hero
  fogScale: 0.5,    // fog is painted at half resolution then upscaled
};

let canvas, ctx, overlay, logo, fog;
let w = 0, h = 0, dpr = 1;
let sun = { x: 0, y: 0 };
let tl;
let done = false;

// ── Public API ────────────────────────────────────────────

// The decision is made by a tiny inline script in <head> (so returning
// visitors never see a flash of the overlay). It adds html.intro.
export function shouldPlayAnimation() {
  return document.documentElement.classList.contains('intro');
}

export async function initAnimation() {
  overlay = document.getElementById('animation-overlay');
  canvas = document.getElementById('intro-canvas');
  logo = document.getElementById('intro-logo');
  if (!overlay || !canvas || !logo) return removeOverlay();

  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }

  document.body.classList.add('no-scroll');
  overlay.classList.add('playing');

  const skipBtn = document.getElementById('skip-btn');
  skipBtn?.addEventListener('click', skip);
  overlay.addEventListener('click', skip);
  window.addEventListener('keydown', skip, { once: true });

  // Wait for the logo so the sun lines up with it (give up after 1.5s)
  try {
    await Promise.race([
      logo.decode(),
      new Promise((_, reject) => setTimeout(reject, 1500)),
    ]);
  } catch {
    return finish();
  }
  if (done) return;

  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  buildTimeline();
}

export function skip() {
  if (done) return;
  if (tl) tl.kill();
  finish();
}

// ── Layout ────────────────────────────────────────────────

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const r = logo.getBoundingClientRect();
  sun = { x: r.left + r.width * SUN.x, y: r.top + r.height * SUN.y };

  fog = paintFog(w, h);
}

// ── Fog (condensation on glass) ───────────────────────────

function paintFog(width, height) {
  const s = CFG.fogScale;
  const fw = Math.max(1, Math.round(width * s));
  const fh = Math.max(1, Math.round(height * s));
  const off = document.createElement('canvas');
  off.width = fw;
  off.height = fh;
  const c = off.getContext('2d');

  // Cool, milky film, a little denser toward the bottom like real condensation
  const base = c.createLinearGradient(0, 0, 0, fh);
  base.addColorStop(0, 'rgba(118, 130, 152, 0.86)');
  base.addColorStop(1, 'rgba(92, 104, 128, 0.92)');
  c.fillStyle = base;
  c.fillRect(0, 0, fw, fh);

  // Fine grain
  const img = c.getImageData(0, 0, fw, fh);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  c.putImageData(img, 0, 0);

  // Droplets: a soft dark body with a bright rim, like beads on a window
  const count = Math.round((fw * fh) / 900);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * fw;
    const y = Math.random() * fh;
    const r = 0.6 + Math.random() ** 3 * 5;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = `rgba(60, 70, 88, ${0.10 + Math.random() * 0.12})`;
    c.fill();
    c.beginPath();
    c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    c.fillStyle = 'rgba(220, 230, 245, 0.5)';
    c.fill();
  }

  // A few clear runs where drops slid down
  for (let i = 0; i < Math.round(fw / 90); i++) {
    const x = Math.random() * fw;
    const y0 = Math.random() * fh * 0.6;
    const len = fh * (0.15 + Math.random() * 0.35);
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = 1 + Math.random() * 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y0);
    let yy = y0, xx = x;
    while (yy < y0 + len) {
      yy += 4 + Math.random() * 6;
      xx += (Math.random() - 0.5) * 1.5;
      c.lineTo(xx, yy);
    }
    c.stroke();
    c.restore();
  }

  return off;
}

// ── Frame rendering ───────────────────────────────────────

const state = { flare: 0, clear: 0, fogAlpha: 1 };

function render() {
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  // 1. Fog, with a hole burned outward from the sun
  if (state.fogAlpha > 0.001) {
    ctx.globalAlpha = state.fogAlpha;
    ctx.drawImage(fog, 0, 0, w, h);
    ctx.globalAlpha = 1;

    if (state.clear > 0) {
      const maxR = Math.hypot(Math.max(sun.x, w - sun.x), Math.max(sun.y, h - sun.y)) * 1.15;
      const r = Math.max(1, maxR * state.clear);
      const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.62, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Warm light catching the edge of the evaporating fog
      const rim = ctx.createRadialGradient(sun.x, sun.y, r * 0.55, sun.x, sun.y, r * 1.05);
      rim.addColorStop(0, 'rgba(247, 151, 111, 0)');
      rim.addColorStop(0.7, `rgba(247, 151, 111, ${0.6 * state.fogAlpha})`);
      rim.addColorStop(1, 'rgba(247, 151, 111, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 2. Sun flare, additive so it glows through the fog
  if (state.flare > 0.001) drawFlare(sun.x, sun.y, state.flare);
}

function drawFlare(x, y, k) {
  const unit = Math.min(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Blue dawn halo
  halo(x, y + unit * 0.05, unit * 0.55 * (0.6 + 0.4 * k), `rgba(46, 108, 169, ${0.38 * k})`);

  // Warm bloom
  halo(x, y, unit * 0.22 * k, `rgba(232, 69, 60, ${0.55 * k})`);

  // Horizontal anamorphic streak
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.018);
  halo(0, 0, w * 0.75 * k, `rgba(242, 106, 61, ${0.75 * k})`);
  ctx.restore();

  // Star rays
  const rays = [
    [0.38, 0.42], [-0.38, 0.42], [Math.PI - 0.38, 0.42], [Math.PI + 0.38, 0.42],
    [Math.PI / 2, 0.22], [-Math.PI / 2, 0.26],
    [1.05, 0.2], [Math.PI - 1.05, 0.2], [-1.1, 0.2], [Math.PI + 1.1, 0.2],
  ];
  for (const [a, len] of rays) {
    const L = unit * len * k;
    const ex = x + Math.cos(a) * L;
    const ey = y + Math.sin(a) * L;
    const g = ctx.createLinearGradient(x, y, ex, ey);
    g.addColorStop(0, `rgba(255, 170, 120, ${0.7 * k})`);
    g.addColorStop(1, 'rgba(232, 69, 60, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, unit * 0.004);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Hot core
  halo(x, y, unit * 0.06 * (0.5 + 0.5 * k), `rgba(255, 246, 225, ${k})`);
  halo(x, y, unit * 0.025, `rgba(255, 255, 255, ${k})`);

  ctx.restore();
}

function halo(x, y, r, color) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── Timeline ──────────────────────────────────────────────

function buildTimeline() {
  gsap.set(logo, { opacity: 0.35, filter: 'blur(10px)', scale: 0.97 });

  tl = gsap.timeline({ onUpdate: render, onComplete: finish });

  // Spark → full flare
  tl.to(state, { flare: 1, duration: CFG.ignite, ease: 'power2.inOut' }, 0.15);

  // Light burns the fog away; the logo comes into focus behind it
  tl.to(state, { clear: 1, duration: CFG.burn, ease: 'power2.in' }, 0.15 + CFG.ignite * 0.45);
  tl.to(logo, {
    opacity: 1, filter: 'blur(0px)', scale: 1,
    duration: CFG.burn, ease: 'power2.out',
  }, 0.15 + CFG.ignite * 0.45);

  // Our flare settles into the logo's own flare
  tl.to(state, { flare: 0, fogAlpha: 0, duration: 0.6, ease: 'power1.inOut' }, 0.15 + CFG.ignite + CFG.burn * 0.55);

  // Hold, then dissolve into the hero
  tl.to(overlay, {
    opacity: 0, duration: CFG.exit, ease: 'power2.inOut',
  }, `+=${CFG.hold}`);
  tl.to(logo, { scale: 1.04, duration: CFG.exit, ease: 'power2.in' }, '<');
}

// ── Finish ────────────────────────────────────────────────

function finish() {
  if (done) return;
  done = true;
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', skip);
  document.body.classList.remove('no-scroll');

  if (overlay) {
    overlay.style.transition = 'opacity 0.35s ease';
    overlay.style.opacity = '0';
    setTimeout(removeOverlay, 380);
  }
  ctx = fog = null;
}

function removeOverlay() {
  document.getElementById('animation-overlay')?.remove();
  document.body.classList.remove('no-scroll');
}
