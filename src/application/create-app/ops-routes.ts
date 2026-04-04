import type { Express } from "express";
import { loadOperationsSummary, renderMetrics, type RouteDependencies } from "./shared";

export function registerOpsRoutes(
  app: Express,
  { store, auditStore, isShuttingDown }: RouteDependencies,
): void {
  app.get("/api/operations/summary", async (_request, response) => {
    response.json({
      summary: await loadOperationsSummary(store, auditStore),
    });
  });

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/readyz", (_request, response) => {
    if (isShuttingDown?.()) {
      response.status(503).json({ status: "shutting_down" });
      return;
    }

    response.json({ status: "ready" });
  });

  app.get("/metrics", async (_request, response) => {
    const summary = await loadOperationsSummary(store, auditStore);
    response.type("text/plain").send(renderMetrics(summary));
  });
}