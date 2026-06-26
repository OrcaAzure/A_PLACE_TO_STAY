module.exports = {
  apps: [{
    name: 'aptspace',
    cwd: './client/server',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '512M',
    kill_timeout: 10_000,
    listen_timeout: 10_000,
    merge_logs: true,
    error_file: './logs/aptspace-error.log',
    out_file: './logs/aptspace-out.log',
  }],
};
