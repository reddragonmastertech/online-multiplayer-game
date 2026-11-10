// PM2 process file. Use this when systemd is not available, or on Windows.
//   pnpm --filter @game-platform/web build
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup
//
// Run it from the repository root; `cwd` below is relative to this file.
module.exports = {
  apps: [
    {
      name: "arena",
      cwd: "../apps/api",
      // tsx runs the TypeScript entry point directly, as `pnpm start` does.
      script: "./node_modules/.bin/tsx",
      args: "--env-file-if-exists=../../.env --env-file-if-exists=.env src/index.ts",
      interpreter: "none",

      // One process only. A second instance keeps its own matchmaking queue
      // and its own live matches, so two players would never meet.
      instances: 1,
      exec_mode: "fork",

      env: {
        NODE_ENV: "production",
      },

      // The app refunds in-flight matches and closes SQLite on SIGTERM, so give
      // it time before PM2 escalates to SIGKILL.
      kill_timeout: 20000,

      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,

      merge_logs: true,
      time: true,
    },
  ],
};
