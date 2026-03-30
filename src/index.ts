import { createServer } from "node:http";
import { once } from "node:events";
import { bootstrap } from "./bootstrap";

function resolvePort(): number {
  const rawValue = process.env.PORT ?? "4020";
  const port = Number(rawValue);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawValue}`);
  }

  return port;
}

async function main() {
  const { app } = bootstrap();
  const port = resolvePort();

  const server = createServer(app);

  server.requestTimeout = 30_000;
  server.headersTimeout = 40_000;
  server.keepAliveTimeout = 5_000;

  server.on("error", (error: Error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });

  let shutdownStarted = false;

  function gracefulShutdown(signal: string) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    process.stdout.write(`\n${signal} received — closing server\n`);
    server.close(() => {
      process.stdout.write("server closed\n");
    });
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  server.listen(port);
  await once(server, "listening");

  process.stdout.write(`personal-doctor-control-plane listening on http://localhost:${port}\n`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
