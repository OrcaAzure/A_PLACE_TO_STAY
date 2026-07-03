/** Side-effect only — no imports. Loaded before server src modules. */
process.env.ENV_FILE = process.env.ENV_FILE || '.env';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
