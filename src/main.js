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
