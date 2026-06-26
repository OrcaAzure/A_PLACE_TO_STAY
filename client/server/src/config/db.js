import mysql from 'mysql2/promise';
import {
  DB_HOST,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL,
  DB_CONNECTION_LIMIT,
} from './env.js';

const poolConfig = {
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: 0,
  dateStrings: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
};

if (DB_SSL) {
  poolConfig.ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

export const pool = mysql.createPool(poolConfig);

export async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
}

export async function closePool() {
  await pool.end();
}
