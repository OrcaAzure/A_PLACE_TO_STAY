/**
 * Start the server with a specific env file.
 * Usage: node scripts/run-server.mjs [.env.staging]
 * Default env file: .env (relative to client/server/)
 */
import path from 'path';
import { fileURLToPath } from 'url';

const envFile = process.argv[2] || '.env';
process.env.ENV_FILE = envFile;

const serverEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/server/src/server.js'
);

await import(serverEntry);
