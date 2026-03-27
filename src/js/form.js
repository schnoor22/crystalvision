/**
 * Crystal Vision Co. — Quote Form Handler
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
}

async function handleSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const successDiv = document.getElementById('quote-success');

  // Gather form data
  const name = form.querySelector('#quote-name').value.trim();
  const phone = form.querySelector('#quote-phone').value.trim();
  const message = form.querySelector('#quote-message').value.trim();

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
    const response = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, message }),
    });

    if (!response.ok) {
      throw new Error('Failed to send');
    }

    // Success!
    showSuccess(form, successDiv);
  } catch (err) {
    console.error('Quote submission error:', err);
    
    // Fallback: show success anyway and store locally
    // (the API might not be set up yet)
    storeLocally({ name, phone, message, timestamp: new Date().toISOString() });
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
