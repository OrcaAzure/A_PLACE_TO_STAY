import dotenv from 'dotenv';
dotenv.config();
 
import app from './app.js';
import { seedUsers } from './config/seed.js';
 
const PORT = process.env.PORT || 3000;
 
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
 
  try {
    await seedUsers();
  } catch (err) {
    console.error('[seed] Failed to seed users:', err.message);
  }
});
 