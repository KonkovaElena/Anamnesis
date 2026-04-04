import type { Express, RequestHandler } from "express";
import { addArtifact, createCase, removeArtifact } from "../../domain/anamnesis";
import { addArtifactSchema, createCaseSchema } from "./schemas";
import {
  appendAuditEvent,
  loadCaseOrRespondNotFound,
  readRouteParam,
  type RouteDependencies,
} from "./shared";

export function registerCaseRoutes(
  app: Express,
  { store, auditStore }: RouteDependencies,
  parseJson: RequestHandler,
): void {
  app.post("/api/cases", parseJson, async (request, response) => {
    const input = createCaseSchema.parse(request.body ?? {});
    const record = createCase(input);
    await store.saveCase(record);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId: record.caseId,
        eventType: "case.created",
        action: "create_case",
        occurredAt: record.createdAt,
        details: {
          hasPatientLabel: Boolean(record.patientLabel),
        },
      },
    );
    response.status(201).json({ case: record });
  });

  app.get("/api/cases", async (_request, response) => {
    const cases = await store.listCases();
    response.json({
      cases,
      meta: {
        totalCases: cases.length,
      },
    });
  });

  app.get("/api/cases/:caseId", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    response.json({ case: record });
  });

  app.post("/api/cases/:caseId/artifacts", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = addArtifactSchema.parse(request.body ?? {});
    const nextCase = addArtifact(record, input);
    await store.saveCase(nextCase);
    const artifact = nextCase.artifacts.at(-1);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId: nextCase.caseId,
        eventType: "artifact.added",
        action: "add_artifact",
        occurredAt: artifact?.createdAt ?? nextCase.updatedAt,
        details: {
          artifactType: artifact?.artifactType ?? input.artifactType,
          hasSourceDate: Boolean(artifact?.sourceDate ?? input.sourceDate),
        },
      },
    );
    response.status(201).json({ case: nextCase });
  });

  app.delete("/api/cases/:caseId/artifacts/:artifactId", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const artifactId = readRouteParam(request.params.artifactId);
    const removedArtifact = record.artifacts.find((artifact) => artifact.artifactId === artifactId);
    const nextCase = removeArtifact(record, artifactId);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId: nextCase.caseId,
        eventType: "artifact.removed",
        action: "remove_artifact",
        occurredAt: nextCase.updatedAt,
        details: {
          artifactId,
          artifactType: removedArtifact?.artifactType ?? "unknown",
        },
      },
    );
    response.json({ case: nextCase });
  });

  app.delete("/api/cases/:caseId", async (request, response) => {
    const caseId = readRouteParam(request.params.caseId);
    const record = await loadCaseOrRespondNotFound(store, response, caseId);
    if (!record) {
      return;
    }

    await store.deleteCase(caseId);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId,
        eventType: "case.deleted",
        action: "delete_case",
        occurredAt: new Date().toISOString(),
        details: {
          artifactCount: record.artifacts.length,
          packetCount: record.physicianPackets.length,
        },
      },
    );

    response.status(204).end();
  });

  app.get("/api/cases/:caseId/audit-events", async (request, response) => {
    const caseId = readRouteParam(request.params.caseId);
    const events = await auditStore.listByCase(caseId);
    response.json({
      events,
      meta: {
        totalEvents: events.length,
      },
    });
  });
}