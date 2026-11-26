/**
 * First Light Window Cleaning — Holiday themes (public site)
 *
 * Picks the theme (see holiday-themes.js for the list and dates) and
 * applies it: a greeting pill in the hero, a few tinted accent lines,
 * a footer note, and a sparse particle layer over the hero photo.
 *
 * Which theme shows:
 *   1. ?holiday=<id> or ?holiday=off in the URL (preview only, not saved)
 *   2. The admin setting (content.holiday.mode): 'auto', 'off' or a theme id
 *   3. With 'auto', the calendar in Hawaii time
 *
 * The last known admin setting is remembered so returning visitors get
 * the right theme straight away, before the content request finishes.
 */

import '../styles/holidays.css';
import { MODE_AUTO, isValidMode, resolveTheme } from './holiday-themes.js';

const MODE_CACHE_KEY = 'fl_holiday_mode';

let previewMode = null;   // from the URL, wins over everything
let activeId = null;      // theme currently applied
let particles = null;     // running particle layer, if any

// ── Public API ────────────────────────────────────────────

// Call once at startup. Applies the best guess immediately.
export function initHoliday() {
  try {
    const param = new URLSearchParams(location.search).get('holiday');
    if (param && isValidMode(param)) previewMode = param;
  } catch { /* ignore */ }

  let mode = MODE_AUTO;
  try {
    const cached = localStorage.getItem(MODE_CACHE_KEY);
    if (cached && isValidMode(cached)) mode = cached;
  } catch { /* ignore */ }

  apply(resolveTheme(previewMode || mode));
}

// Call when the site content has loaded, with content.holiday
export function setHolidaySetting(setting) {
  const mode = isValidMode(setting?.mode) ? setting.mode : MODE_AUTO;
  try { localStorage.setItem(MODE_CACHE_KEY, mode); } catch { /* ignore */ }
  if (!previewMode) apply(resolveTheme(mode));
}

// ── Apply / remove ────────────────────────────────────────

function apply(theme) {
  const id = theme?.id || null;
  if (id === activeId) return;
  clear();
  activeId = id;
  if (!theme) return;

  const root = document.documentElement;
  root.dataset.holiday = theme.id;
  ['a', 'b', 'c'].forEach((k, i) => root.style.setProperty(`--holiday-${k}`, theme.colors[i]));

  // Greeting pill above the hero heading
  const heroContent = document.querySelector('.hero-content');
  if (heroContent) {
    const pill = document.createElement('div');
    pill.className = 'holiday-pill';
    pill.dataset.holidayEl = '';
    pill.append(icon(theme.icon), document.createTextNode(theme.greeting));
    heroContent.prepend(pill);
  }

  // Small greeting above the copyright line
  const copyright = document.getElementById('current-year')?.closest('p');
  if (copyright) {
    const note = document.createElement('p');
    note.className = 'holiday-footer-note';
    note.dataset.holidayEl = '';
    note.append(icon(theme.icon), document.createTextNode(`${theme.greeting} from First Light`));
    copyright.before(note);
  }

  // Particles over the hero photo (skipped for reduced motion)
  const hero = document.getElementById('hero');
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (hero && theme.particles && !calm) particles = startParticles(hero, theme.particles);
}

function clear() {
  particles?.stop();
  particles = null;
  document.querySelectorAll('[data-holiday-el]').forEach((el) => el.remove());
  const root = document.documentElement;
  delete root.dataset.holiday;
  ['a', 'b', 'c'].forEach((k) => root.style.removeProperty(`--holiday-${k}`));
}

function icon(name) {
  const i = document.createElement('i');
  i.className = `ph-fill ph-${name}`;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

// ── Particles ─────────────────────────────────────────────
// One small canvas over the hero. Three behaviours:
//   snow     soft flakes drifting down
//   motes    warm specks of light rising slowly, like dust in a sunbeam
//   twinkle  points of light that fade in and out in place

function startParticles(hero, cfg) {
  const canvas = document.createElement('canvas');
  canvas.className = 'holiday-canvas';
  canvas.dataset.holidayEl = '';
  canvas.setAttribute('aria-hidden', 'true');
  const overlay = hero.querySelector('.hero-overlay');
  if (overlay) overlay.after(canvas);
  else hero.prepend(canvas);

  const ctx = canvas.getContext('2d');
  const sprites = cfg.colors.map(makeSprite);
  const rand = (min, max) => min + Math.random() * (max - min);

  let w = 0, h = 0, dpr = 1;
  let items = [];
  let raf = 0, last = 0, running = false, visible = true, stopped = false;

  function spawn(anywhere) {
    const p = {
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
      x: rand(0, w),
      phase: rand(0, Math.PI * 2),
    };
    if (cfg.kind === 'snow') {
      p.r = rand(1.5, 4.5);
      p.y = anywhere ? rand(0, h) : -10;
      p.vy = rand(14, 34) * (p.r / 3);
      p.sway = rand(6, 18);
      p.alpha = rand(0.25, 0.7);
    } else if (cfg.kind === 'twinkle') {
      p.r = rand(2, 5);
      p.y = rand(0, h * 0.8);
      p.life = anywhere ? rand(0, 1) : 0;
      p.speed = rand(0.18, 0.4);     // full fade in and out takes 2.5 to 5.5s
      p.alpha = rand(0.4, 0.85);
    } else {
      p.r = rand(2, 6);
      p.y = anywhere ? rand(0, h) : h + 10;
      p.vy = -rand(6, 18);
      p.sway = rand(8, 22);
      p.alpha = rand(0.18, 0.55);
    }
    return p;
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fewer particles on narrow screens so phones stay just as sparse
    const count = Math.max(10, Math.round(cfg.count * Math.min(1.25, w / 1440)));
    items = Array.from({ length: count }, () => spawn(true));
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      let alpha = p.alpha;
      let x = p.x;

      if (cfg.kind === 'twinkle') {
        p.life += p.speed * dt;
        if (p.life >= 1) { items[i] = spawn(false); continue; }
        alpha *= Math.sin(p.life * Math.PI);
      } else {
        p.y += p.vy * dt;
        x += Math.sin(t * 0.6 + p.phase) * p.sway;
        if (cfg.kind === 'motes') alpha *= 0.65 + 0.35 * Math.sin(t * 1.3 + p.phase);
        if (p.y > h + 12 || p.y < -12) { items[i] = spawn(false); continue; }
      }

      const size = p.r * 4;          // the sprite's glow extends past its core
      ctx.globalAlpha = alpha;
      ctx.drawImage(p.sprite, x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function update() {
    const shouldRun = !stopped && visible && !document.hidden;
    if (shouldRun && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  // Only animate while the hero is on screen and the tab is in front
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); })
    : null;
  io?.observe(hero);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  ro?.observe(hero);
  document.addEventListener('visibilitychange', update);

  resize();
  update();

  return {
    stop() {
      stopped = true;
      update();
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', update);
      canvas.remove();
    },
  };
}

// A soft round dot with a glow, drawn once per colour and reused
function makeSprite(color) {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.22, color);
  grad.addColorStop(0.5, hexToRgba(color, 0.28));
  grad.addColorStop(1, hexToRgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
