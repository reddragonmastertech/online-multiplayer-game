import * as Sentry from "@sentry/node";

export function initMonitoring(dsn: string | undefined) {
  if (!dsn) {
    return;
  }

  Sentry.init({ dsn });
}
