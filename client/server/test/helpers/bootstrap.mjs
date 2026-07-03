import './env-setup.mjs';
import { after } from 'node:test';
import { closePool } from '../../src/config/db.js';

after(async () => {
  try {
    await closePool();
  } catch {
    /* ignore */
  }
});
