// PM2 process definition for RobikServer.
// Usage on the server (after `npm install` in apps/server + prisma generate):
//   pm2 start ecosystem.config.cjs
//   pm2 save
// The server runs via tsx (same resolver as `npm run dev`), so the project's
// bundler-style / extensionless imports work without a compile step. NODE_ENV
// is intentionally left to apps/server/.env (development over plain HTTP).
module.exports = {
  apps: [
    {
      name: "robikserver",
      cwd: "./apps/server",
      script: "node_modules/.bin/tsx",
      args: "src/main.ts",
      interpreter: "none",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
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
