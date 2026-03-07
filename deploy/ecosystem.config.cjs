// Crystal Vision Co. — PM2 Ecosystem Configuration
// Usage: pm2 start deploy/ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'crystalvision-api',
      script: './api/server.js',
      cwd: '/var/www/crystalvisionusa',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '/var/www/crystalvisionusa/api/.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/crystalvision-error.log',
      out_file: '/var/log/pm2/crystalvision-out.log',
    },
  ],
};
