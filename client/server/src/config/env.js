import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.join(serverRoot, envFile) });

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const isProduction = NODE_ENV === 'production';

export const {
  PORT,
  HOST,
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  ALLOWED_ORIGIN,
  DEFAULT_PASSWORD,
  APP_URL,
} = process.env;

export const SMTP_HOST = process.env.SMTP_HOST || process.env.MAIL_HOST;
export const SMTP_PORT = process.env.SMTP_PORT || process.env.MAIL_PORT;
export const SMTP_USER = process.env.SMTP_USER || process.env.MAIL_USER;
export const SMTP_PASS = process.env.SMTP_PASS || process.env.MAIL_PASS;
export const SMTP_FROM = process.env.SMTP_FROM || process.env.MAIL_FROM;
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL;

export const DB_SSL = process.env.DB_SSL === 'true';
export const DB_CONNECTION_LIMIT = Number(process.env.DB_CONNECTION_LIMIT) || 10;

/** In-memory API response cache (set CACHE_ENABLED=false to disable). */
export const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
export const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS) || 120;
export const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES) || 500;

/** General API rate limit per IP (requests per minute). */
export const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX)
  || (isProduction ? 120 : 600);

/** Skip MySQL connect/seed and bypass portal page auth — static UI preview only. */
export const UI_ONLY = process.env.UI_ONLY === 'true' || process.env.UI_ONLY === '1';

const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500',
];

/** Comma-separated ALLOWED_ORIGIN, or localhost defaults in development. */
export function getAllowedOrigins() {
  if (!ALLOWED_ORIGIN) {
    return isProduction ? [] : LOCAL_ORIGINS;
  }
  return ALLOWED_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
}
