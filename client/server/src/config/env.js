import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(serverRoot, '.env') });

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

export const DB_SSL = process.env.DB_SSL === 'true';
export const DB_CONNECTION_LIMIT = Number(process.env.DB_CONNECTION_LIMIT) || 10;

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
