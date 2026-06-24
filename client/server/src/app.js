import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes    from './routes/auth.routes.js';
import roomRoutes    from './routes/room.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import userRoutes    from './routes/user.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import statsRoutes   from './routes/stats.routes.js';
import groupRoutes    from './routes/group.routes.js';
import facilityRoutes  from './routes/facility.routes.js';
import settingsRoutes  from './routes/settings.routes.js';
import pageRoutes      from './routes/pages.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir  = path.join(__dirname, '../../public');

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api', (req, res) => {
  res.json({ message: 'AptSpace API is running' });
});

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/rooms',    roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/groups',   groupRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/stats',      statsRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/settings',   settingsRoutes);

app.use(pageRoutes);

app.use(express.static(publicDir, { extensions: ['html'] }));

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Server error',
  });
});

export default app;