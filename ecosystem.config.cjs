// PM2 process definition for RobikServer.
// Usage on the server (after `npm install` + `npm run build` in apps/server):
//   pm2 start ecosystem.config.cjs
//   pm2 save
module.exports = {
  apps: [
    {
      name: "robikserver",
      cwd: "./apps/server",
      script: "dist/main.js",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
    // Optional: serve the built admin panel with Vite's static preview.
    // For real deployments prefer nginx serving apps/admin/dist instead.
    // {
    //   name: "robik-admin",
    //   cwd: "./apps/admin",
    //   script: "node_modules/vite/bin/vite.js",
    //   args: "preview --host 0.0.0.0 --port 5173",
    //   env: { NODE_ENV: "production" },
    // },
  ],
};
