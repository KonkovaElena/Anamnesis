import type { Express } from "express";
import { verifyAuditChain } from "../../domain/anamnesis";
import { loadOperationsSummary, readRemoteJwtJwksObservability, renderMetrics, type RouteDependencies } from "./shared";

export function registerOpsRoutes(
  app: Express,
  { store, auditStore, isShuttingDown, remoteJwtJwksTelemetry }: RouteDependencies,
): void {
  app.get("/api/operations/summary", async (request, response) => {
    response.json({
      summary: await loadOperationsSummary(store, auditStore, request.principal),
      remoteJwks: readRemoteJwtJwksObservability(remoteJwtJwksTelemetry),
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
    response.type("text/plain").send(renderMetrics(summary, readRemoteJwtJwksObservability(remoteJwtJwksTelemetry)));
  });

  app.get("/api/audit-chain/verify", async (request, response) => {
    const caseId = typeof request.query.caseId === "string" ? request.query.caseId.trim() : "";
    if (!caseId) {
      response.status(400).json({
        code: "missing_case_id",
        message: "Query parameter caseId is required.",
      });
      return;
    }

    const events = await auditStore.listByCase(caseId);
    const result = verifyAuditChain(events);
    response.json({ result });
  });
}