import { isProduction, JWT_SECRET, DB_HOST, DB_NAME, DB_USER, APP_URL, DEFAULT_PASSWORD, UI_ONLY } from './env.js';

const WEAK_SECRETS = new Set([
  'change_this_to_a_long_random_string',
  'secret',
  'jwt_secret',
  'your_jwt_secret',
]);

function fail(message) {
  console.error(`[config] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[config] ${message}`);
}

export function validateEnv() {
  if (UI_ONLY && isProduction) {
    fail('UI_ONLY cannot be enabled in production.');
  }

  const secret = JWT_SECRET?.trim();
  const missing = [];
  if (!DB_HOST) missing.push('DB_HOST');
  if (!DB_USER) missing.push('DB_USER');
  if (!DB_NAME) missing.push('DB_NAME');
  if (!secret) missing.push('JWT_SECRET');
  if (missing.length) {
    fail(`Missing required env vars: ${missing.join(', ')}. Copy .env.example to client/server/.env`);
  }

  if (secret.length < 32) {
    if (isProduction) {
      fail('JWT_SECRET must be at least 32 characters in production.');
    }
    warn('JWT_SECRET is shorter than 32 characters — use a longer random value before deploying.');
  }

  if (isProduction) {
    if (WEAK_SECRETS.has(secret.toLowerCase())) {
      fail('JWT_SECRET is still the example placeholder. Generate a strong random secret.');
    }
    if (!process.env.ALLOWED_ORIGIN) {
      fail('ALLOWED_ORIGIN is required in production (comma-separated app URLs).');
    }
    if (!APP_URL) {
      fail('APP_URL is required in production (used in password-reset emails).');
    } else if (!APP_URL.startsWith('https://')) {
      warn('APP_URL should use https:// in production.');
    }
    if (!DEFAULT_PASSWORD || DEFAULT_PASSWORD === 'password') {
      warn('DEFAULT_PASSWORD is weak or unset — only used when ENABLE_SEED=true on first bootstrap.');
    }
    if (process.env.ENABLE_DEMO_DATA === 'true') {
      warn('ENABLE_DEMO_DATA=true loads demo bookings in production — disable after testing.');
    }
  }
}
