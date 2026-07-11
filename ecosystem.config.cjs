module.exports = {
  apps: [
    {
      name: 'warden-backend',
      script: 'src/index.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      env: {
        WARDEN_OFFLINE_BYPASS: 'true',
      },
    },
    {
      name: 'warden-frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: '--port 5174',
      cwd: 'ui',
    },
  ],
};
