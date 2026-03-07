/**
 * Crystal Vision Co. — Modal System
 * 
 * Accessible modals with focus trapping, ESC dismiss,
 * backdrop click, and smooth CSS transitions.
 */

let activeModal = null;
let previousFocus = null;
let focusTrapHandler = null;

export function initModals() {
  // Open modal buttons: data-modal="quote" → opens #modal-quote
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-modal]');
    if (trigger) {
      e.preventDefault();
      const modalId = trigger.getAttribute('data-modal');
      openModal(modalId);
    }
  });

  // Close modal buttons
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) {
      e.preventDefault();

      // Check if this close button also wants to open another modal
      const openNext = closeBtn.getAttribute('data-open-modal');
      
      closeModal(() => {
        if (openNext) {
          // Small delay to let close animation finish
          setTimeout(() => openModal(openNext), 100);
        }
      });
    }
  });

  // Close on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal();
      }
    });
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModal) {
      closeModal();
    }
  });
}

export function openModal(id) {
  const modal = document.getElementById(`modal-${id}`);
  if (!modal) return;

  // Close any currently open modal first
  if (activeModal) {
    closeModal(() => {
      setTimeout(() => performOpen(modal), 100);
    });
    return;
  }

  performOpen(modal);
}

function performOpen(modal) {
  // Save current focus for restoration
  previousFocus = document.activeElement;
  activeModal = modal;

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Focus the first focusable element inside the modal
  requestAnimationFrame(() => {
    const focusable = getFocusableElements(modal);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  });

  // Set up focus trap
  focusTrapHandler = (e) => trapFocus(e, modal);
  document.addEventListener('keydown', focusTrapHandler);
}

export function closeModal(callback) {
  if (!activeModal) {
    if (callback) callback();
    return;
  }

  const modal = activeModal;
  modal.classList.remove('active');
  document.body.style.overflow = '';

  // Remove focus trap
  if (focusTrapHandler) {
    document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
  }

  // Restore focus
  if (previousFocus && previousFocus.focus) {
    previousFocus.focus();
  }

  activeModal = null;
  previousFocus = null;

  if (callback) {
    setTimeout(callback, 300); // wait for close animation
  }
}

// ─── Focus Trap ─────────────────────────────────────────────

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null); // visible only
}

function trapFocus(e, container) {
  if (e.key !== 'Tab') return;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
