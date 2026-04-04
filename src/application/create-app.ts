import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { createRateLimiter } from "./rate-limiter";
import { AnamnesisDomainError, type AnamnesisStore, type AuditTrailStore, type ExternalAttachmentFetcher } from "../domain/anamnesis";
import { registerCaseRoutes } from "./create-app/case-routes";
import { registerIngestionRoutes } from "./create-app/ingestion-routes";
import { registerOpsRoutes } from "./create-app/ops-routes";
import { registerPacketRoutes } from "./create-app/packet-routes";
import { isMalformedJsonError } from "./create-app/shared";

interface CreateAppDependencies {
  store: AnamnesisStore;
  auditStore: AuditTrailStore;
  isShuttingDown?: () => boolean;
  authMiddleware?: (request: Request, response: Response, next: NextFunction) => void;
  rateLimitRpm?: number;
  externalAttachmentFetcher?: ExternalAttachmentFetcher;
}

export function createApp({
  store,
  auditStore,
  isShuttingDown,
  authMiddleware,
  rateLimitRpm,
  externalAttachmentFetcher,
}: CreateAppDependencies) {
  const app = express();
  const parseJson = express.json({ limit: "256kb" });

  app.use((request, response, next) => {
    const requestId = (request.headers["x-request-id"] as string) || randomUUID();
    response.setHeader("x-request-id", requestId);
    next();
  });

  app.use(helmet());
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use((request, response, next) => {
    const start = performance.now();
    response.on("finish", () => {
      const durationMs = (performance.now() - start).toFixed(1);
      process.stdout.write(`${request.method} ${request.path} ${response.statusCode} ${durationMs}ms\n`);
    });
    next();
  });

  if (authMiddleware) {
    app.use(authMiddleware);
  }

  if (rateLimitRpm && rateLimitRpm > 0) {
    app.use(
      createRateLimiter({
        windowMs: 60_000,
        maxRequests: rateLimitRpm,
        skipPaths: new Set(["/healthz", "/readyz"]),
      }),
    );
  }

  const routeDependencies = {
    store,
    auditStore,
    externalAttachmentFetcher,
    isShuttingDown,
  };

  registerCaseRoutes(app, routeDependencies, parseJson);
  registerIngestionRoutes(app, routeDependencies, parseJson);
  registerPacketRoutes(app, routeDependencies, parseJson);
  registerOpsRoutes(app, routeDependencies);

  app.use((_request, response) => {
    response.status(404).json({
      code: "route_not_found",
      message: "Route not found.",
    });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (isMalformedJsonError(error)) {
      response.status(400).json({
        code: "invalid_json",
        message: "Request body contains malformed JSON.",
      });
      return;
    }

    if (error instanceof ZodError) {
      response.status(400).json({
        code: "invalid_input",
        message: "Request body validation failed.",
        details: error.issues,
      });
      return;
    }

    if (error instanceof AnamnesisDomainError) {
      response.status(error.statusCode).json({
        code: error.code,
        message: error.message,
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown application error.";
    process.stderr.write(`[500] ${message}\n`);
    response.status(500).json({
      code: "internal_error",
      message: "An internal error occurred.",
    });
  });

  return app;
}