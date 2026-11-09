import { defineConfig, devices } from "@playwright/test";

/**
 * The e2e run is fully isolated from development: its own API port (3101), its
 * own throwaway SQLite file (apps/api/data/e2e.db) and its own Vite port
 * (5174). `reuseExistingServer` is off so a running `pnpm dev` is never
 * borrowed, which would otherwise write test accounts into the dev database.
 */
export default defineConfig({
  testDir: "./e2e",
  // Matchmaking is one global queue keyed by game/mode/stake, so two tests
  // searching at the same stake will pair with each other's players. One
  // worker keeps each test facing the opponent it created.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Matchmaking lives in one API process's memory, so every browser in the run
  // must share this single server.
  webServer: [
    {
      command: "pnpm --filter @game-platform/api start:e2e",
      cwd: "../..",
      url: "http://localhost:3101/health",
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: "pnpm exec vite --mode e2e --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: false,
    },
  ],
});
