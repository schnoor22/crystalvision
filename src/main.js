/**
 * Crystal Vision Co. — Main Entry
 * 
 * Boots all modules: animation, modals, form, navigation,
 * scroll reveals. Phosphor Icons load via CSS imports in main.css.
 */

import './styles/main.css';
import { loadContent, trackPageView } from './js/content.js';
import { shouldPlayAnimation, initAnimation } from './js/animation.js';
import { initModals } from './js/modals.js';
import { initForm } from './js/form.js';

// ─── Boot ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Load editable content from API (cache-first, no flash)
  loadContent();

  // Track page view
  trackPageView();

  // Squeegee animation
  if (shouldPlayAnimation()) {
    initAnimation();
  } else {
    const overlay = document.getElementById('animation-overlay');
    if (overlay) overlay.remove();
    document.body.classList.remove('no-scroll');
  }

  // Modals
  initModals();

  // Quote form
  initForm();

  // Gallery, Reviews, Videos
  loadGallery();
  loadReviews();
  loadVideos();

  // Navigation
  initNav();

  // Scroll reveals
  initScrollReveal();
});

// ─── Navigation ─────────────────────────────────────────────

function initNav() {
  const nav = document.getElementById('site-nav');
  const hamburger = document.getElementById('hamburger-btn');
  const drawer = document.getElementById('mobile-drawer');
  const drawerClose = document.getElementById('drawer-close');
  const backdrop = document.getElementById('mobile-backdrop');

  // Scroll → add .scrolled class (handled by CSS)
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Open drawer
  const openDrawer = () => {
    drawer?.classList.add('open');
    backdrop?.classList.add('open');
    document.body.classList.add('no-scroll');
  };

  // Close drawer
  const closeDrawer = () => {
    drawer?.classList.remove('open');
    backdrop?.classList.remove('open');
    document.body.classList.remove('no-scroll');
  };

  hamburger?.addEventListener('click', openDrawer);
  drawerClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);

  // Close on link click
  document.querySelectorAll('.mobile-link').forEach((link) => {
    link.addEventListener('click', closeDrawer);
  });

  // Close drawer on quote button inside drawer
  drawer?.querySelector('[data-modal]')?.addEventListener('click', closeDrawer);
}

// ─── Scroll Reveal ──────────────────────────────────────────

function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -60px 0px',
      }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('revealed'));
  }
}

// ─── Gallery ────────────────────────────────────────────────

async function loadGallery() {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/gallery');
    if (!res.ok) throw new Error('fetch failed');
    const items = await res.json();

    if (!items.length) {
      grid.closest('section')?.remove();
      return;
    }

    grid.innerHTML = items.map(item => `
      <a href="/portfolio.html" class="gallery-thumb block overflow-hidden rounded-xl aspect-square bg-slate-100 group">
        <img
          src="${item.filename}"
          alt="${escHtml(item.caption || 'Window cleaning result')}"
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </a>
    `).join('');

    // Let scroll reveal pick up new elements
    initScrollReveal();
  } catch (err) {
    console.warn('Gallery load failed:', err);
    grid.closest('section')?.remove();
  }
}

// ─── Reviews ────────────────────────────────────────────────

async function loadReviews() {
  const grid = document.getElementById('reviews-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/reviews');
    if (!res.ok) throw new Error('fetch failed');
    const reviews = await res.json();

    if (!reviews.length) {
      grid.closest('section')?.remove();
      return;
    }

    grid.innerHTML = reviews.map(r => `
      <div class="review-card bg-white rounded-2xl p-7 shadow-sm flex flex-col gap-4">
        <div class="flex gap-1 text-amber-400">
          ${'<i class="ph-fill ph-star text-lg"></i>'.repeat(Math.min(5, Math.max(1, r.rating || 5)))}
        </div>
        <p class="text-slate-600 leading-relaxed flex-1">"${escHtml(r.text)}"</p>
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-ocean-900 text-white flex items-center justify-center text-sm font-semibold">
            ${escHtml((r.name || '?').charAt(0).toUpperCase())}
          </div>
          <div>
            <div class="font-semibold text-slate-800 text-sm">${escHtml(r.name || 'Customer')}</div>
            ${r.date ? `<div class="text-xs text-slate-400">${escHtml(r.date)}</div>` : ''}
          </div>
          <img src="https://www.google.com/favicon.ico" alt="Google" class="w-5 h-5 ml-auto opacity-50" loading="lazy" />
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.warn('Reviews load failed:', err);
    grid.closest('section')?.remove();
  }
}

// ─── Videos ─────────────────────────────────────────────────

async function loadVideos() {
  const grid = document.getElementById('videos-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/content');
    if (!res.ok) throw new Error('fetch failed');
    const content = await res.json();

    const items = content?.videos?.items || [];
    const hasVideos = items.some(v => v && v.url);

    if (!hasVideos) {
      grid.closest('section')?.remove();
      return;
    }

    grid.innerHTML = items.map(v => {
      if (!v || !v.url) return '';
      const embedUrl = toEmbedUrl(v.url);
      if (!embedUrl) return '';
      return `
        <div class="video-card rounded-2xl overflow-hidden aspect-video bg-slate-900 shadow-md">
          <iframe
            src="${embedUrl}"
            title="${escHtml(v.title || 'Crystal Vision video')}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            class="w-full h-full"
            loading="lazy"
          ></iframe>
        </div>
      `;
    }).join('');

    if (!grid.innerHTML.trim()) {
      grid.closest('section')?.remove();
    }
  } catch (err) {
    console.warn('Videos load failed:', err);
    grid.closest('section')?.remove();
  }
}

function toEmbedUrl(url) {
  if (!url) return null;
  // Already an embed URL
  if (url.includes('youtube.com/embed/')) return url;
  // Watch URL: https://www.youtube.com/watch?v=ID
  const watchMatch = url.match(/youtube\.com\/watch\?.*v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  // Short URL: https://youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  return null;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
