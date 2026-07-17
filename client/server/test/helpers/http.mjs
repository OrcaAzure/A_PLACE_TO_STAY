import assert from 'node:assert/strict';
import request from 'supertest';
import './env-setup.mjs';
import app from '../../src/app.js';
import { testConnection } from '../../src/config/db.js';
import { AUTH_COOKIE } from '../../src/utils/cookies.js';
import { runSchemaPatches } from '../../src/seed/index.js';
import { seedUsers } from '../../src/seed/data/users.js';
import { purgeTestAccounts } from './db-cleanup.mjs';

export { app };

let schemaReadyPromise;

async function ensureSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        await testConnection();
        await runSchemaPatches();
        await purgeTestAccounts();
        await seedUsers({ includeDemo: true });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return schemaReadyPromise;
}

export function api() {
  return request.agent(app);
}

export async function isDbAvailable() {
  return ensureSchemaReady();
}

function hasAuthCookie(res) {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return false;
  const list = Array.isArray(cookies) ? cookies : [cookies];
  return list.some((c) => c.startsWith(`${AUTH_COOKIE}=`) && !c.includes('Max-Age=0'));
}

/** Log in via POST /api/auth/login; supertest agent stores the httpOnly cookie. */
export async function loginAs(agent, email, password = 'password') {
  const res = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.body?.message || res.text}`);
  assert.ok(res.body.user, 'login response missing user');
  assert.ok(hasAuthCookie(res), 'login response missing auth cookie');
  assert.equal(res.body.token, undefined, 'login response must not expose JWT in JSON');
  return res.body.user;
}

/** Bearer header — for tests that explicitly exercise Authorization fallback. */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
