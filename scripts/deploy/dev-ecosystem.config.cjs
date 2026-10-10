module.exports = {
  apps: [{
    name: 'belok-dev',
    cwd: '/var/www/belok-dev-current',
    script: 'server.js',
    interpreter: '/root/.nvm/versions/node/v24.14.1/bin/node',
    node_args: '--env-file=/var/www/dev.belok.pro/.env --env-file=/var/www/dev.belok.pro/.env.local',
    env: {
      NODE_ENV: 'production', PORT: '3001', HOSTNAME: '127.0.0.1',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/tbank/russian-trusted-ca-bundle.pem',
    },
    autorestart: true,
    max_memory_restart: '450M',
    kill_timeout: 5000,
  }],
};
