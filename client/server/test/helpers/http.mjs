import assert from 'node:assert/strict';
import request from 'supertest';
import './env-setup.mjs';
import app from '../../src/app.js';
import { testConnection } from '../../src/config/db.js';

export { app };

export function api() {
  return request(app);
}

export async function isDbAvailable() {
  try {
    await testConnection();
    return true;
  } catch {
    return false;
  }
}

export async function loginAs(agent, email, password = 'password') {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.body?.message || res.text}`);
  assert.ok(res.body.token, 'login response missing token');
  return res.body.token;
}

export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
