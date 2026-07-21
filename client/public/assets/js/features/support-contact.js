import { getSupportContact } from '/assets/js/services/api.js';

function dialable(value) {
  return String(value || '').replace(/[^\d+]/g, '');
}

export function renderSupportContact(root, contact) {
  if (!root || !contact) return;
  root.querySelectorAll('[data-contact-name]').forEach((el) => { el.textContent = contact.name; });
  root.querySelectorAll('[data-contact-email]').forEach((el) => { el.textContent = contact.email; });
  root.querySelectorAll('[data-contact-label]').forEach((el) => { el.textContent = contact.label; });
  root.querySelectorAll('[data-contact-telephone]').forEach((el) => { el.textContent = contact.telephone; });
  root.querySelectorAll('[data-contact-mobile]').forEach((el) => { el.textContent = contact.mobile; });
  root.querySelectorAll('[data-contact-fax]').forEach((el) => { el.textContent = contact.fax; });
  root.querySelectorAll('[data-contact-address]').forEach((el) => { el.textContent = contact.address; });
  root.querySelectorAll('[data-contact-email-link]').forEach((el) => {
    el.href = `mailto:${contact.email}`;
  });
  root.querySelectorAll('[data-contact-phone-link]').forEach((el) => {
    el.href = `tel:${dialable(contact.mobile || contact.telephone)}`;
  });
}

export async function loadSupportContact(root = document) {
  const contact = await getSupportContact();
  renderSupportContact(root, contact);
  return contact;
}
