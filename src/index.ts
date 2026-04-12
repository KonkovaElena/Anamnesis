import { createServer } from "node:http";
import { once } from "node:events";
import { bootstrap } from "./bootstrap";
import { createGracefulShutdownHandler } from "./graceful-shutdown";
import type { JwtJwkSet } from "./core/jwt-verification";

function resolvePort(): number {
  const rawValue = process.env.PORT ?? "4020";
  const port = Number(rawValue);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${rawValue}`);
  }

  return port;
}

function parseJwtJwksEnv(rawValue: string | undefined): JwtJwkSet | undefined {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return undefined;
  }

  try {
    return JSON.parse(normalized) as JwtJwkSet;
  } catch {
    throw new Error("JWT_JWKS must be valid JSON containing a JWK Set object.");
  }
}

async function main() {
  let shuttingDown = false;

  const apiKey = process.env.API_KEY?.trim() || undefined;
  const jwtSecret = process.env.JWT_SECRET?.trim() || undefined;
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n").trim() || undefined;
  const jwtJwks = parseJwtJwksEnv(process.env.JWT_JWKS);
  const jwtIssuer = process.env.JWT_ISSUER?.trim() || undefined;
  const jwtAudience = process.env.JWT_AUDIENCE?.trim() || undefined;
  const jwtTyp = process.env.JWT_TYP?.trim() || undefined;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() || undefined;
  const allowInsecureDevAuth = (process.env.ALLOW_INSECURE_DEV_AUTH?.trim().toLowerCase() === "true");
  const rateLimitRpm = Number(process.env.RATE_LIMIT_RPM ?? "0") || undefined;
  const storePath = process.env.STORE_PATH?.trim() || undefined;
  const encryptionKey = process.env.ENCRYPTION_KEY?.trim() || undefined;
  const externalAttachmentAllowedHosts = (process.env.EXTERNAL_ATTACHMENT_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (!apiKey && !jwtSecret && !jwtPublicKey && !jwtJwks && allowInsecureDevAuth) {
    process.stdout.write(
      "[WARN] API_KEY, JWT_SECRET, JWT_PUBLIC_KEY, and JWT_JWKS are not set — unauthenticated access is enabled only because ALLOW_INSECURE_DEV_AUTH=true was explicitly configured.\n",
    );
  }

  if (!storePath) {
    process.stdout.write("[WARN] STORE_PATH is not set — using in-memory store. Data will not persist across restarts.\n");
  }

  const { app, closeStore } = bootstrap({
    isShuttingDown: () => shuttingDown,
    apiKey,
    jwtSecret,
    jwtPublicKey,
    jwtJwks,
    jwtIssuer,
    jwtAudience,
    jwtTyp,
    allowInsecureDevAuth,
    nodeEnv,
    rateLimitRpm,
    storePath,
    encryptionKey,
    externalAttachmentAllowedHosts,
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

  process.stdout.write(`anamnesis-control-plane listening on http://localhost:${port}\n`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
