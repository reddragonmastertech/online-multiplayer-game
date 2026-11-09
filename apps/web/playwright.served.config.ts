import { defineConfig, devices } from "@playwright/test";

/**
 * Step 9's check: the same suite, against the built bundle served by the API
 * on one port. No Vite, no proxy — this is what a tester on the public URL
 * actually gets. Run it with `pnpm test:e2e:served`, which builds first.
 */
export default defineConfig({
  testDir: "./e2e",
  // Same reason as the dev config: one global matchmaking queue.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3102",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "served",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @game-platform/api start:served",
      cwd: "../..",
      url: "http://localhost:3102/health",
      reuseExistingServer: false,
    },
  ],
});
