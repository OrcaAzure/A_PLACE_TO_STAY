/**
 * Shared photo-grid markup for admin photo managers (Manage Rooms & Manage Venues).
 *
 * Both modals render the same thumbnail grid with replace/remove controls and a
 * JPG/PNG upload button; only the data-attribute names, input ids, and copy
 * differ. Centralizing the HTML keeps the two managers visually and behaviorally
 * identical (styles: .mf-photo-* in admin-crud-modal.css).
 *
 * Callers still own event wiring — they bind to the `data-*` attributes given
 * in `attrPrefix` (e.g. `data-room-photo-replace` / `data-room-photo-delete`).
 */
import { escapeHtml } from '/assets/js/features/reservation-shared.js';

const ACCEPTED_TYPES = 'image/jpeg,image/png,.jpg,.jpeg,.png';

function photoFilename(src) {
  return String(src || '').split('/').pop();
}

/**
 * Render the photo thumbnail grid (or the empty-state message).
 *
 * @param {string[]} images - Public image paths (always treated as an array).
 * @param {object} opts
 * @param {boolean} opts.canManage - Show replace/remove controls.
 * @param {boolean} opts.uploading - Disable controls while an upload runs.
 * @param {string} opts.attrPrefix - Data-attribute stem, e.g. 'room-photo'
 *   → `data-room-photo-replace` / `data-room-photo-delete`.
 * @param {string} opts.altText - Alt text for thumbnails.
 * @returns {string} HTML string.
 */
export function renderPhotoThumbs(images, { canManage, uploading, attrPrefix, altText }) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!list.length) {
    return '<p class="mf-photo-empty">No photos yet. Guests will see a placeholder until you add one.</p>';
  }
  return `<div class="mf-photo-grid" role="list">${list.map((src) => {
    const name = photoFilename(src);
    return `
      <figure class="mf-photo-thumb" role="listitem">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async" />
        ${canManage ? `
          <div class="mf-photo-actions">
            <label class="mf-photo-replace" title="Replace photo">
              <input
                type="file"
                accept="${ACCEPTED_TYPES}"
                class="sr-only"
                data-${attrPrefix}-replace="${escapeHtml(name)}"
                ${uploading ? 'disabled' : ''}
              />
              <span class="material-symbols-outlined" aria-hidden="true">sync</span>
              <span class="sr-only">Replace photo</span>
            </label>
            <button type="button" class="mf-photo-remove" data-${attrPrefix}-delete="${escapeHtml(name)}" aria-label="Remove photo">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>` : ''}
      </figure>`;
  }).join('')}</div>`;
}

/**
 * Render the multi-file upload button + hint.
 *
 * @param {object} opts
 * @param {string} opts.inputId - Id for the hidden file input (caller binds change).
 * @param {boolean} opts.uploading - Show "Uploading…" and disable input.
 * @param {boolean} opts.atLimit - Disable when max photo count is reached.
 * @param {string} opts.hint - Helper copy shown under the button.
 * @returns {string} HTML string.
 */
export function renderPhotoUploadBlock({ inputId, uploading, atLimit, hint }) {
  const disabled = uploading || atLimit;
  return `
    <div class="mf-photo-upload">
      <label class="mf-photo-upload-btn${disabled ? ' is-disabled' : ''}">
        <input
          id="${escapeHtml(inputId)}"
          type="file"
          accept="${ACCEPTED_TYPES}"
          multiple
          class="sr-only"
          ${disabled ? 'disabled' : ''}
        />
        <span class="material-symbols-outlined">upload</span>
        ${uploading ? 'Uploading…' : 'Upload JPG or PNG'}
      </label>
      <p class="mf-field-hint">${escapeHtml(hint)}</p>
    </div>`;
}
