// pm2 ecosystem for DayNest API
// Usage:
//   pm2 start deploy/pm2/ecosystem.config.cjs
//   pm2 save
//   pm2 startup     # follow the printed command to enable boot-time start
//
// The API process picks env vars from /etc/daynest/.env. We don't bake secrets
// into this file; pm2 loads them via the `env_file` option (pm2 >= 6) or via
// systemd. For pm2 < 6, source the file before starting:
//   set -a && . /etc/daynest/.env && set +a && pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'daynest-api',
      script: 'dist/src/index.js',
      cwd: '/var/www/daynest/api',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      kill_timeout: 5000,
      time: true,
      env_file: '/etc/daynest/.env',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/log/daynest/api.out.log',
      error_file: '/var/log/daynest/api.err.log',
      merge_logs: true,
    },
  ],
};
