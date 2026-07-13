#!/usr/bin/env node
/**
 * Start the dev server without MySQL — HTML/CSS/JS UI preview only.
 * API calls and login will not work; portal pages load without auth.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'client', 'server');

const child = spawn('npm', ['run', 'dev'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, UI_ONLY: 'true' },
});

child.on('exit', (code) => process.exit(code ?? 0));
