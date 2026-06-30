import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes    from './routes/auth.routes.js';
import roomRoutes    from './routes/room.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import userRoutes    from './routes/user.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import statsRoutes   from './routes/stats.routes.js';
import groupRoutes    from './routes/group.routes.js';
import facilityRoutes        from './routes/facility.routes.js';
import facilityBookingRoutes from './routes/facilityBooking.routes.js';
import ancillaryRoutes       from './routes/ancillary.routes.js';
import settingsRoutes  from './routes/settings.routes.js';
import pageRoutes      from './routes/pages.routes.js';
import { requestLogger } from './middleware/requestLogger.js';
import { pool }        from './config/db.js';
import { getAllowedOrigins, isProduction, API_RATE_LIMIT_MAX } from './config/env.js';
import { cache } from './utils/cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir  = path.join(__dirname, '../../public');

const app = express();

if (isProduction) {
  app.set('trust proxy', 1);
}

const helmetOptions = isProduction
  ? {
      contentSecurityPolicy: {
        directives: {
          defaultSrc:     ["'self'"],
          scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
          styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
          imgSrc:         ["'self'", 'data:', 'https:'],
          connectSrc:     ["'self'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
          workerSrc:      ["'self'", 'blob:'],
        },
      },
    }
  : {
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      strictTransportSecurity: false,
    };

app.use(helmet(helmetOptions));

app.use(cors({
  origin: getAllowedOrigins(),
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api', (req, res, next) => {
  if (!['POST', 'PATCH', 'PUT'].includes(req.method)) return next();
  const len = Number(req.headers['content-length'] || 0);
  if (len === 0) return next();
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) {
    return res.status(415).json({ message: 'Content-Type must be application/json' });
  }
  next();
});

app.use(requestLogger);

app.get('/api', (req, res) => {
  res.json({ message: 'AptSpace API is running' });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'connected',
      env: isProduction ? 'production' : 'development',
      cache: cache.stats(),
    });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', cache: cache.stats() });
  }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password',  authLimiter);

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/rooms',    roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/groups',   groupRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/stats',      statsRoutes);
app.use('/api/facilities',        facilityRoutes);
app.use('/api/facility-bookings', facilityBookingRoutes);
app.use('/api/catalog',           ancillaryRoutes);
app.use('/api/settings',   settingsRoutes);

app.use(pageRoutes);

app.use(express.static(publicDir, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    if (/\.(js|css|woff2?|png|jpe?g|svg|ico|webp)$/i.test(filePath)) {
      res.setHeader('Cache-Control', isProduction ? 'public, max-age=86400' : 'no-cache');
    }
  },
}));

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.status(404).type('text/plain').send('Page not found');
});

app.use((err, req, res, next) => {
  const target = req.originalUrl || req.url;
  const who = req.user?.email ? ` user=${req.user.email}` : '';
  console.error(`[api] ✗ ERROR ${req.method} ${target}${who} — ${err.message}`);
  if (!isProduction && err.stack) console.error(err.stack);
  const status = err.statusCode || 500;
  const expose = status < 500 || !isProduction;
  res.status(status).json({
    message: expose ? (err.message || 'Server error') : 'Server error',
  });
});

export default app;