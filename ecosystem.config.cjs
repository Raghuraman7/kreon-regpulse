// pm2 process supervision for the real-time watcher daemon.
// package.json sets "type": "module", so this file is named .cjs to force
// CommonJS — pm2 loads ecosystem configs with require(), not import().
// Usage: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "kreon-regpulse-watch",
      script: "scripts/watch-realtime.mjs",
      cwd: __dirname,
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_restarts: 20,
      min_uptime: "30s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      out_file: "logs/watch-out.log",
      error_file: "logs/watch-error.log",
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
