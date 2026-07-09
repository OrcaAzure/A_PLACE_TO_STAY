/** Comma-separated housing Super Admin emails (e.g. staff@apts.edu.ph). */
export function parseEmailAllowlist(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getHousingSuperAdminEmails() {
  return parseEmailAllowlist(process.env.HOUSING_SUPER_ADMIN_EMAILS);
}

export function isHousingSuperAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.length > 0 && getHousingSuperAdminEmails().includes(normalized);
}
