import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import roomRoutes from './routes/room.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import userRoutes from './routes/user.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../../public');

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api', (req, res) => {
  res.json({ message: 'AptSpace API is running' });
});

app.use('/api/auth',     authRoutes);
app.use('/api/rooms',    roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users',    userRoutes);

app.use(express.static(publicDir));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

export default app;