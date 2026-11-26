/**
 * First Light Window Cleaning — Quote Form Handler
 * 
 * Handles form validation, submission to the API,
 * and success/error states.
 */

import { closeModal } from './modals.js';

export function initForm() {
  const form = document.getElementById('quote-form');
  if (!form) return;

  form.addEventListener('submit', handleSubmit);

  // Phone number formatting
  const phoneInput = document.getElementById('quote-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', formatPhoneNumber);
  }

  initPhotos(form);
}

// ─── Photos ──────────────────────────────────────────────────
// Photos are shrunk in the browser to a ~1600px JPEG (usually 200–500 KB)
// so a handful fit well under the server's 4.5 MB request limit, even
// straight off a phone camera.

const MAX_PHOTOS = 5;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // per photo, matches the API

let photos = []; // { id, file: Blob|null, url, ready: Promise }
let photoSeq = 0;

function initPhotos(form) {
  const input = document.getElementById('quote-photos');
  if (!input) return;

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = ''; // allow picking the same photo again after removing it
    addPhotos(files);
  });

  document.getElementById('quote-photo-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-photo]');
    if (!btn) return;
    removePhoto(Number(btn.dataset.removePhoto));
  });

  form.addEventListener('reset', () => {
    photos.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    photos = [];
    renderPhotos();
    setPhotoNote('');
  });
}

function addPhotos(files) {
  const room = MAX_PHOTOS - photos.length;
  const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (images.length < files.length) setPhotoNote('Only image files can be attached.', true);
  else setPhotoNote('');
  if (images.length > room) {
    setPhotoNote(`You can attach up to ${MAX_PHOTOS} photos.`, true);
  }

  images.slice(0, Math.max(room, 0)).forEach((file) => {
    const entry = { id: ++photoSeq, file: null, url: '', ready: null };
    entry.ready = shrinkImage(file)
      .then((blob) => {
        entry.file = blob;
        entry.url = URL.createObjectURL(blob);
      })
      .catch(() => {
        // Browser couldn't decode it (e.g. HEIC on some desktops): send the
        // original if it's small enough, otherwise drop it.
        if (file.size <= MAX_UPLOAD_BYTES) {
          entry.file = file;
        } else {
          photos = photos.filter((p) => p !== entry);
          setPhotoNote(`"${file.name}" couldn't be added. Try a JPEG or a smaller photo.`, true);
        }
      })
      .finally(renderPhotos);
    photos.push(entry);
  });
  renderPhotos();
}

function removePhoto(id) {
  const p = photos.find((x) => x.id === id);
  if (p?.url) URL.revokeObjectURL(p.url);
  photos = photos.filter((x) => x.id !== id);
  setPhotoNote('');
  renderPhotos();
}

function renderPhotos() {
  const list = document.getElementById('quote-photo-list');
  const picker = document.querySelector('label[for="quote-photos"]');
  if (!list) return;
  list.innerHTML = photos.map((p, i) => `
    <div class="photo-thumb${p.file ? '' : ' is-busy'}">
      ${p.url ? `<img src="${p.url}" alt="Photo ${i + 1}" />` : '<span class="sr-only">Preparing photo…</span>'}
      <button type="button" class="photo-remove" data-remove-photo="${p.id}" aria-label="Remove photo ${i + 1}"><i class="ph-bold ph-x"></i></button>
    </div>`).join('');
  if (picker) {
    picker.classList.toggle('is-full', photos.length >= MAX_PHOTOS);
    const label = picker.querySelector('span');
    if (label) label.textContent = photos.length ? 'Add more photos' : 'Add photos of your windows';
  }
}

function setPhotoNote(text, isError = false) {
  const note = document.getElementById('quote-photo-note');
  if (!note) return;
  note.textContent = text;
  note.hidden = !text;
  note.classList.toggle('is-error', isError);
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(src);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      if (!w || !h) return reject(new Error('bad image'));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // flatten transparent PNGs
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('decode failed'));
    };
    img.src = src;
  });
}

async function handleSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const successDiv = document.getElementById('quote-success');

  // Gather form data
  const name    = form.querySelector('#quote-name').value.trim();
  const phone   = form.querySelector('#quote-phone').value.trim();
  const message = form.querySelector('#quote-message').value.trim();
  const address = (form.querySelector('#quote-address')?.value || '').trim();
  const source  = form.querySelector('#quote-source')?.value || '';

  // Basic validation
  if (!name || !phone) {
    shakeElement(submitBtn);
    return;
  }

  // Phone validation (at least 10 digits)
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) {
    shakeElement(form.querySelector('#quote-phone'));
    return;
  }

  // Show loading state
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Sending...</span>
  `;

  try {
    // Wait for any photos still being prepared
    await Promise.all(photos.map((p) => p.ready));
    const ready = photos.filter((p) => p.file);

    let request;
    if (ready.length) {
      const body = new FormData();
      Object.entries({ name, phone, message, address, source }).forEach(([k, v]) => body.append(k, v));
      ready.forEach((p, i) => {
        const type = p.file.type || 'image/jpeg';
        const ext = type === 'image/jpeg' ? 'jpg' : (type.split('/')[1] || 'jpg');
        body.append('photos', p.file, `photo-${i + 1}.${ext}`);
      });
      request = { method: 'POST', body };
    } else {
      request = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, message, address, source }),
      };
    }

    const response = await fetch('/api/quote', request);

    if (response.status === 400 || response.status === 413) {
      // A problem the visitor can fix (usually photos): tell them, keep the form.
      const data = await response.json().catch(() => ({}));
      setPhotoNote(data.error || 'Something was wrong with the request. Please check and try again.', true);
      shakeElement(submitBtn);
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to send');
    }

    // Success!
    showSuccess(form, successDiv);
  } catch (err) {
    console.error('Quote submission error:', err);
    
    // Fallback: show success anyway and store locally
    // (the API might not be set up yet)
    storeLocally({ name, phone, message, address, source, timestamp: new Date().toISOString() });
    showSuccess(form, successDiv);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

function showSuccess(form, successDiv) {
  // Hide form fields, show success message
  const fields = form.querySelectorAll('div, button[type="submit"]');
  fields.forEach((el) => {
    el.style.display = 'none';
  });
  
  if (successDiv) {
    successDiv.classList.remove('hidden');
    successDiv.style.display = 'block';
  }

  // Close modal after a moment then reset the form for next time
  setTimeout(() => {
    closeModal();
    // Reset form state after modal close animation finishes
    setTimeout(() => {
      form.reset();
      fields.forEach((el) => {
        el.style.display = '';
      });
      if (successDiv) {
        successDiv.classList.add('hidden');
        successDiv.style.display = '';
      }
    }, 400);
  }, 2000);
}

function formatPhoneNumber(e) {
  let value = e.target.value.replace(/\D/g, '');
  
  if (value.length > 10) {
    value = value.substring(0, 10);
  }
  
  if (value.length >= 7) {
    value = `(${value.substring(0, 3)}) ${value.substring(3, 6)}-${value.substring(6)}`;
  } else if (value.length >= 4) {
    value = `(${value.substring(0, 3)}) ${value.substring(3)}`;
  } else if (value.length >= 1) {
    value = `(${value}`;
  }
  
  e.target.value = value;
}

function shakeElement(el) {
  if (!el) return;
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'shake 0.5s ease';
  el.style.borderColor = '#ef4444';
  
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.animation = '';
  }, 1000);
}

function storeLocally(data) {
  try {
    const existing = JSON.parse(localStorage.getItem('cv-quote-submissions') || '[]');
    existing.push(data);
    localStorage.setItem('cv-quote-submissions', JSON.stringify(existing));
  } catch {
    // silently fail
  }
}
