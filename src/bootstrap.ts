import { type NextFunction, type Request, type Response } from "express";
import { createAuthMiddleware } from "./application/auth-middleware";
import { createApp } from "./application/create-app";
import { assertJwtPublicKeyStrength } from "./core/jwt-verification";
import type { AuditTrailStore, ExternalAttachmentFetcher, AnamnesisStore } from "./domain/anamnesis";
import { InMemoryAnamnesisStore } from "./infrastructure/InMemoryAnamnesisStore";
import { InMemoryAuditTrailStore } from "./infrastructure/InMemoryAuditTrailStore";
import { parseEncryptionKey } from "./infrastructure/encryption";
import { HttpExternalAttachmentFetcher } from "./infrastructure/HttpExternalAttachmentFetcher";
import { SqliteAuditTrailStore } from "./infrastructure/SqliteAuditTrailStore";
import { SqliteAnamnesisStore } from "./infrastructure/SqliteAnamnesisStore";

export interface BootstrapOptions {
  isShuttingDown?: () => boolean;
  apiKey?: string;
  jwtSecret?: string;
  jwtPublicKey?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  jwtTyp?: string;
  allowInsecureDevAuth?: boolean;
  nodeEnv?: string;
  rateLimitRpm?: number;
  storePath?: string;
  encryptionKey?: string;
  externalAttachmentFetcher?: ExternalAttachmentFetcher;
  externalAttachmentAllowedHosts?: string[];
}

function assertProductionJwtSecretStrength(jwtSecret: string | undefined, nodeEnv: string | undefined): void {
  if (nodeEnv !== "production" || !jwtSecret) {
    return;
  }

  if (Buffer.byteLength(jwtSecret, "utf8") < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes when NODE_ENV=production.");
  }
}

function assertJwtVerificationConfiguration(options: BootstrapOptions, nodeEnv: string | undefined): void {
  if (options.jwtSecret && options.jwtPublicKey) {
    throw new Error("JWT_SECRET and JWT_PUBLIC_KEY are mutually exclusive; configure exactly one JWT verification key source.");
  }

  assertProductionJwtSecretStrength(options.jwtSecret, nodeEnv);

  if (options.jwtPublicKey) {
    assertJwtPublicKeyStrength(options.jwtPublicKey);
  }
}

export function bootstrap(options?: BootstrapOptions) {
  let store: AnamnesisStore;
  let auditStore: AuditTrailStore;
  let closeStore: (() => void) | undefined;
  const normalizedNodeEnv = options?.nodeEnv?.trim().toLowerCase();
  const allowInsecureDevAuth = options?.allowInsecureDevAuth === true;

  assertJwtVerificationConfiguration(options ?? {}, normalizedNodeEnv);

  if (!options?.apiKey && !options?.jwtSecret && !options?.jwtPublicKey) {
    if (!allowInsecureDevAuth) {
      throw new Error(
        "API_KEY, JWT_SECRET, or JWT_PUBLIC_KEY is required unless ALLOW_INSECURE_DEV_AUTH=true is explicitly enabled for local development.",
      );
    }

    if (normalizedNodeEnv === "production") {
      throw new Error("ALLOW_INSECURE_DEV_AUTH cannot be enabled when NODE_ENV=production.");
    }
  }

  const httpExternalAttachmentFetcher = new HttpExternalAttachmentFetcher({
    allowedHosts: options?.externalAttachmentAllowedHosts,
  });
  const externalAttachmentFetcher = options?.externalAttachmentFetcher
    ?? httpExternalAttachmentFetcher.fetchAttachment.bind(httpExternalAttachmentFetcher);

  if (options?.storePath) {
    if (!options.encryptionKey) {
      throw new Error("ENCRYPTION_KEY is required when STORE_PATH is set");
    }
    const key = parseEncryptionKey(options.encryptionKey);
    const sqliteStore = new SqliteAnamnesisStore({ dbPath: options.storePath, encryptionKey: key });
    const sqliteAuditStore = new SqliteAuditTrailStore({ dbPath: options.storePath });
    store = sqliteStore;
    auditStore = sqliteAuditStore;
    closeStore = () => {
      sqliteAuditStore.close();
      sqliteStore.close();
    };
  } else {
    store = new InMemoryAnamnesisStore();
    auditStore = new InMemoryAuditTrailStore();
  }

  let authMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | undefined;
  if (options?.apiKey || options?.jwtSecret || options?.jwtPublicKey) {
    authMiddleware = createAuthMiddleware({
      apiKey: options?.apiKey,
      jwt: options?.jwtSecret
        ? {
            secret: options.jwtSecret,
            issuer: options.jwtIssuer,
            audience: options.jwtAudience,
            expectedTyp: options.jwtTyp,
          }
        : options?.jwtPublicKey
          ? {
              publicKeyPem: options.jwtPublicKey,
              issuer: options.jwtIssuer,
              audience: options.jwtAudience,
              expectedTyp: options.jwtTyp,
            }
        : undefined,
      skipPaths: new Set(["/healthz", "/readyz", "/metrics"]),
    });
  }

  const app = createApp({
    store,
    auditStore,
    isShuttingDown: options?.isShuttingDown,
    authMiddleware,
    rateLimitRpm: options?.rateLimitRpm,
    externalAttachmentFetcher,
  });

  return {
    app,
    store,
    auditStore,
    closeStore,
  };
}
