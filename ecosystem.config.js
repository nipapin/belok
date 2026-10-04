module.exports = {
  apps: [
    {
      name: 'belok',
      cwd: __dirname,
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        NODE_EXTRA_CA_CERTS:
          process.env.NODE_EXTRA_CA_CERTS || '/etc/ssl/tbank/russian-trusted-ca-bundle.pem',
      },
    },
  ],
};
