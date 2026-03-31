import { type NextFunction, type Request, type Response } from "express";
import { createApp } from "./application/create-app";
import { InMemoryPersonalDoctorStore } from "./infrastructure/InMemoryPersonalDoctorStore";

export interface BootstrapOptions {
  isShuttingDown?: () => boolean;
  apiKey?: string;
  rateLimitRpm?: number;
}

export function bootstrap(options?: BootstrapOptions) {
  const store = new InMemoryPersonalDoctorStore();

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
  };
}
