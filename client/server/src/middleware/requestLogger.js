import { isProduction } from '../config/env.js';

const STATIC_EXT = /\.(css|js|mjs|cjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|lottie)$/i;

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
    || req.socket?.remoteAddress
    || '-';
  return raw.replace(/^::ffff:/, '');
}

function userContext(req) {
  const { id, email, role } = req.user || {};
  if (email) return ` user=${email}${role ? ` (${role})` : ''}`;
  if (id) return ` userId=${id}`;
  return '';
}

function shouldLog(req) {
  const path = req.path || '';

  if (path.startsWith('/api/')) return true;
  if (path === '/api' || path === '/api/health') return true;

  if (isProduction) return false;

  if (path === '/favicon.ico') return false;
  if (STATIC_EXT.test(path)) return false;
  if (path.startsWith('/assets/') || path.startsWith('/components/')) return false;

  return req.method === 'GET';
}

function isExpectedClientNoise(status, target = '') {
  if (status === 401 && (target.includes('/auth/me') || target.includes('/auth/session'))) return true;
  if (status === 404 && target.includes('/auth/me')) return true;
  return false;
}

function statusSymbol(status) {
  if (status >= 500) return '✗';
  if (status >= 400) return '!';
  return '→';
}

function logLine(level, parts) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(parts.join(''));
}

/**
 * Terminal request tracking — logs API traffic and (in dev) page navigations.
 */
export function requestLogger(req, res, next) {
  if (!shouldLog(req)) return next();

  const start = process.hrtime.bigint();
  const target = req.originalUrl || req.url;
  const tag = req.path.startsWith('/api') ? 'api' : 'http';

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const level = status >= 500
      ? 'error'
      : (status >= 400 && !isExpectedClientNoise(status, target))
        ? 'warn'
        : 'log';

    logLine(level, [
      `[${tag}] `,
      status >= 500 ? '✗' : (status >= 400 && !isExpectedClientNoise(status, target)) ? '!' : '→',
      ' ',
      req.method,
      ' ',
      target,
      ' ',
      status,
      ' ',
      `${ms.toFixed(0)}ms`,
      ' ip=',
      clientIp(req),
      userContext(req),
    ]);
  });

  next();
}
