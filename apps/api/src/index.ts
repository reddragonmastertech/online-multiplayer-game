import { loadConfig } from "./config";
import { initMonitoring } from "./infra/monitoring";
import { buildServer } from "./server";

const config = loadConfig();

initMonitoring(config.sentryDsn);

const { app } = await buildServer(config);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

/**
 * PM2 and systemd restart by sending SIGTERM. Closing Fastify runs the onClose
 * hook, which stops the match clock, refunds matches that cannot survive the
 * restart, and closes SQLite cleanly instead of leaving the WAL mid-write.
 */
let closing = false;

async function shutdown(signal: NodeJS.Signals) {
  if (closing) return;
  closing = true;

  app.log.info({ signal }, "shutting down");

  const giveUp = setTimeout(() => {
    app.log.error("shutdown took too long; exiting anyway");
    process.exit(1);
  }, 10_000);
  giveUp.unref();

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "shutdown failed");
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void shutdown(signal));
}
