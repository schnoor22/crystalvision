/**
 * Crystal Vision Co. — Content Loader
 *
 * Fetches editable site content from /api/content and applies
 * it to elements decorated with data-content-key="key.path".
 *
 * Also fires a page-view tracking ping to /api/track.
 */

const CONTENT_CACHE_KEY = 'cv_content';
const CONTENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Get nested value from object by dot-path ────────────────

function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, k) => acc?.[k], obj);
}

// ─── Apply content object to DOM ─────────────────────────────

function applyContent(content) {
  // Text content
  document.querySelectorAll('[data-content-key]').forEach((el) => {
    const val = getPath(content, el.dataset.contentKey);
    if (val !== undefined && val !== null) el.textContent = val;
  });

  // href attributes (links)
  document.querySelectorAll('[data-content-href]').forEach((el) => {
    const val = getPath(content, el.dataset.contentHref);
    if (val) el.href = val;
  });

  // Background image styles
  document.querySelectorAll('[data-content-bgurl]').forEach((el) => {
    const val = getPath(content, el.dataset.contentBgurl);
    if (val) el.style.backgroundImage = `url('${val}')`;
  });
}

// ─── Load content (cache-first, then fresh) ──────────────────

export async function loadContent() {
  // 1. Apply cached content immediately (prevents flash)
  try {
    const cached = JSON.parse(sessionStorage.getItem(CONTENT_CACHE_KEY) || 'null');
    if (cached?.data && Date.now() - cached.ts < CONTENT_CACHE_TTL) {
      applyContent(cached.data);
      return;
    }
  } catch { /* ignore */ }

  // 2. Fetch fresh content from API
  try {
    const res = await fetch('/api/content');
    if (!res.ok) return;
    const data = await res.json();
    applyContent(data);
    sessionStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* network error — keep defaults */ }
}

// ─── Track page view ─────────────────────────────────────────

export function trackPageView() {
  // Fire-and-forget — don't block page load
  const payload = JSON.stringify({
    referrer:  document.referrer || '',
    userAgent: navigator.userAgent || '',
  });
  try {
    // Use Blob so sendBeacon sets Content-Type: application/json
    // (plain string sends text/plain which Express json() middleware ignores)
    navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
  } catch {
    // Fallback for browsers without sendBeacon
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}
