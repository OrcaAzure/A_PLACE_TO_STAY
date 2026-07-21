/**
 * Gmail-style support compose for guest portal pages.
 */

import { getProfile, getSupportContact, sendSupportMessage } from '/assets/js/services/api.js';
import { getCurrentUser } from '/assets/js/services/auth.js';

const ROOT_ID = 'guest-support-compose';

function ensureComposeRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'guest-compose hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'guest-compose-title');
  root.innerHTML = `
    <div class="guest-compose__panel">
      <header class="guest-compose__bar">
        <h2 id="guest-compose-title" class="guest-compose__title">New message</h2>
        <div class="guest-compose__bar-actions">
          <button type="button" class="guest-compose__icon-btn" data-compose-minimize aria-label="Minimize">
            <span class="material-symbols-outlined">minimize</span>
          </button>
          <button type="button" class="guest-compose__icon-btn" data-compose-close aria-label="Close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>
      <form class="guest-compose__body" id="guest-compose-form">
        <div class="guest-compose__row">
          <label for="guest-compose-to">To</label>
          <input id="guest-compose-to" type="text" readonly tabindex="-1" />
        </div>
        <div class="guest-compose__row">
          <label for="guest-compose-from">From</label>
          <input id="guest-compose-from" type="text" readonly tabindex="-1" />
        </div>
        <div class="guest-compose__row guest-compose__row--subject">
          <input id="guest-compose-subject" type="text" maxlength="160" placeholder="Subject" required />
        </div>
        <textarea id="guest-compose-message" rows="8" maxlength="4000" placeholder="Write your message…" required></textarea>
        <p id="guest-compose-feedback" class="guest-compose__feedback hidden" role="status"></p>
        <footer class="guest-compose__footer">
          <button type="submit" id="guest-compose-send" class="guest-compose__send">
            <span class="material-symbols-outlined">send</span>
            Send
          </button>
        </footer>
      </form>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function setFeedback(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
  el.classList.toggle('guest-compose__feedback--error', isError);
  el.classList.toggle('guest-compose__feedback--success', !isError && Boolean(message));
}

export function initGuestSupportCompose({ trigger } = {}) {
  const triggerEl = typeof trigger === 'string' ? document.querySelector(trigger) : trigger;
  if (!triggerEl || triggerEl.dataset.supportComposeBound === '1') return;

  const root = ensureComposeRoot();
  const form = root.querySelector('#guest-compose-form');
  const toEl = root.querySelector('#guest-compose-to');
  const fromEl = root.querySelector('#guest-compose-from');
  const subjectEl = root.querySelector('#guest-compose-subject');
  const messageEl = root.querySelector('#guest-compose-message');
  const feedbackEl = root.querySelector('#guest-compose-feedback');
  const sendBtn = root.querySelector('#guest-compose-send');
  const minimizeBtn = root.querySelector('[data-compose-minimize]');
  const closeBtn = root.querySelector('[data-compose-close]');

  let contactEmail = 'guestservices@apts.edu';
  let contactLabel = 'Facilities team';
  let senderLabel = '';

  async function loadContact() {
    try {
      const contact = await getSupportContact();
      contactEmail = contact.email || contactEmail;
      contactLabel = contact.label || contactLabel;
    } catch {
      /* keep defaults */
    }

    try {
      const { user } = await getProfile();
      const name = user?.full_name || user?.name || getCurrentUser()?.full_name || 'Guest';
      const email = user?.email || getCurrentUser()?.email || '';
      senderLabel = email ? `${name} <${email}>` : name;
    } catch {
      const user = getCurrentUser();
      const name = user?.full_name || 'Guest';
      const email = user?.email || '';
      senderLabel = email ? `${name} <${email}>` : name;
    }

    if (toEl) toEl.value = `${contactLabel} <${contactEmail}>`;
    if (fromEl) fromEl.value = senderLabel;
  }

  function openCompose() {
    root.classList.remove('hidden', 'is-minimized');
    setFeedback(feedbackEl, '');
    if (!senderLabel) loadContact();
    subjectEl?.focus();
  }

  function closeCompose() {
    root.classList.add('hidden');
    root.classList.remove('is-minimized');
  }

  function minimizeCompose() {
    root.classList.toggle('is-minimized');
  }

  triggerEl.addEventListener('click', (e) => {
    e.preventDefault();
    openCompose();
  });

  minimizeBtn?.addEventListener('click', minimizeCompose);
  closeBtn?.addEventListener('click', closeCompose);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.classList.contains('hidden')) {
      closeCompose();
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = subjectEl?.value.trim() || '';
    const message = messageEl?.value.trim() || '';
    if (!subject || !message) {
      setFeedback(feedbackEl, 'Please enter a subject and message.', true);
      return;
    }

    sendBtn.disabled = true;
    const original = sendBtn.innerHTML;
    sendBtn.innerHTML = '<span class="material-symbols-outlined guest-compose__spin">progress_activity</span> Sending…';
    setFeedback(feedbackEl, '');

    try {
      const result = await sendSupportMessage({
        subject,
        message,
        page: document.title || window.location.pathname,
      });
      setFeedback(feedbackEl, result.message || 'Message sent.', false);
      if (subjectEl) subjectEl.value = '';
      if (messageEl) messageEl.value = '';
      setTimeout(closeCompose, 2200);
    } catch (err) {
      setFeedback(feedbackEl, err.message || 'Could not send your message.', true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = original;
    }
  });

  triggerEl.dataset.supportComposeBound = '1';
  loadContact();
}
