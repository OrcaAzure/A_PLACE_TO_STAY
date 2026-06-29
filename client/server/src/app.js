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
import settingsRoutes  from './routes/settings.routes.js';
import pageRoutes      from './routes/pages.routes.js';
import { pool }        from './config/db.js';
import { getAllowedOrigins, isProduction } from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir  = path.join(__dirname, '../../public');

const app = express();

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'"],
      workerSrc:      ["'self'", 'blob:'],
    },
  },
}));

app.use(cors({
  origin: getAllowedOrigins(),
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/api', (req, res) => {
  res.json({ message: 'AptSpace API is running' });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', env: isProduction ? 'production' : 'development' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

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
app.use('/api/settings',   settingsRoutes);

app.use(pageRoutes);

app.use(express.static(publicDir, { extensions: ['html'] }));

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
  console.error(err.stack || err);
  const status = err.statusCode || 500;
  const expose = status < 500 || !isProduction;
  res.status(status).json({
    message: expose ? (err.message || 'Server error') : 'Server error',
  });
});

export default app;