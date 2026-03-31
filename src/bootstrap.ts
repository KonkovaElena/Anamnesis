import { type NextFunction, type Request, type Response } from "express";
import { createApp } from "./application/create-app";
import { InMemoryPersonalDoctorStore } from "./infrastructure/InMemoryPersonalDoctorStore";
import { parseEncryptionKey } from "./infrastructure/encryption";
import { SqlitePersonalDoctorStore } from "./infrastructure/SqlitePersonalDoctorStore";
import type { PersonalDoctorStore } from "./domain/personal-doctor";

export interface BootstrapOptions {
  isShuttingDown?: () => boolean;
  apiKey?: string;
  rateLimitRpm?: number;
  storePath?: string;
  encryptionKey?: string;
}

export function bootstrap(options?: BootstrapOptions) {
  let store: PersonalDoctorStore;
  let closeStore: (() => void) | undefined;

  if (options?.storePath) {
    if (!options.encryptionKey) {
      throw new Error("ENCRYPTION_KEY is required when STORE_PATH is set");
    }
    const key = parseEncryptionKey(options.encryptionKey);
    const sqliteStore = new SqlitePersonalDoctorStore({ dbPath: options.storePath, encryptionKey: key });
    store = sqliteStore;
    closeStore = () => sqliteStore.close();
  } else {
    store = new InMemoryPersonalDoctorStore();
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
    isShuttingDown: options?.isShuttingDown,
    authMiddleware,
    rateLimitRpm: options?.rateLimitRpm,
  });

  return {
    app,
    store,
    closeStore,
  };
}
