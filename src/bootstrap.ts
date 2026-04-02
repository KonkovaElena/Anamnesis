import { type NextFunction, type Request, type Response } from "express";
import { createApp } from "./application/create-app";
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
  rateLimitRpm?: number;
  storePath?: string;
  encryptionKey?: string;
  externalAttachmentFetcher?: ExternalAttachmentFetcher;
}

export function bootstrap(options?: BootstrapOptions) {
  let store: AnamnesisStore;
  let auditStore: AuditTrailStore;
  let closeStore: (() => void) | undefined;
  const externalAttachmentFetcher = options?.externalAttachmentFetcher
    ?? new HttpExternalAttachmentFetcher().fetchAttachment.bind(new HttpExternalAttachmentFetcher());

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
  if (options?.apiKey) {
    const { createAuthMiddleware } = require("./application/auth-middleware") as typeof import("./application/auth-middleware");
    authMiddleware = createAuthMiddleware({
      apiKey: options.apiKey,
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
