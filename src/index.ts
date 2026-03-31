import { createServer } from "node:http";
import { once } from "node:events";
import { bootstrap } from "./bootstrap";
import { createGracefulShutdownHandler } from "./graceful-shutdown";

function resolvePort(): number {
  const rawValue = process.env.PORT ?? "4020";
  const port = Number(rawValue);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawValue}`);
  }

  return port;
}

async function main() {
  let shuttingDown = false;

  const apiKey = process.env.API_KEY?.trim() || undefined;
  const rateLimitRpm = Number(process.env.RATE_LIMIT_RPM ?? "0") || undefined;
  const storePath = process.env.STORE_PATH?.trim() || undefined;
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim() || undefined;

  if (!apiKey) {
    process.stdout.write("[WARN] API_KEY is not set — all endpoints are unauthenticated. Set API_KEY in production.\n");
  }

  if (!storePath) {
    process.stdout.write("[WARN] STORE_PATH is not set — using in-memory store. Data will not persist across restarts.\n");
  }

  const { app, closeStore } = bootstrap({
    isShuttingDown: () => shuttingDown,
    apiKey,
    rateLimitRpm,
    storePath,
    encryptionKey,
  });
  const port = resolvePort();

  const server = createServer(app);

  server.requestTimeout = 30_000;
  server.headersTimeout = 40_000;
  server.keepAliveTimeout = 5_000;

  server.on("error", (error: Error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });

  const gracefulShutdown = createGracefulShutdownHandler(server, {
    forceCloseTimeoutMs: 10_000,
    writeStdout: (message) => {
      process.stdout.write(message);
    },
    writeStderr: (message) => {
      process.exitCode = 1;
      process.stderr.write(message);
    },
  });

  process.on("SIGTERM", () => { shuttingDown = true; closeStore?.(); gracefulShutdown("SIGTERM"); });
  process.on("SIGINT", () => { shuttingDown = true; closeStore?.(); gracefulShutdown("SIGINT"); });

  server.listen(port);
  await once(server, "listening");

  process.stdout.write(`personal-doctor-control-plane listening on http://localhost:${port}\n`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
