module.exports = {
  apps: [
    {
      name: "finance-dashboard",
      script: "src/index.ts",
      cwd: "./server",
      interpreter: "npx",
      interpreter_args: "tsx",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      // Restart if it crashes, but not in an infinite loop
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      // Log files
      out_file: "../logs/app.out.log",
      error_file: "../logs/app.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
