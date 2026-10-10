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
