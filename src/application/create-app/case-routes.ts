import type { Express, RequestHandler } from "express";
import {
  addArtifact,
  attachStudyContext,
  buildArtifactEvidenceLineage,
  createCase,
  recordQcSummary,
  registerSample,
  removeArtifact,
} from "../../domain/anamnesis";
import {
  addArtifactSchema,
  attachStudyContextSchema,
  createCaseSchema,
  recordQcSummarySchema,
  registerSampleSchema,
} from "./schemas";
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

  app.get("/api/cases/:caseId/evidence-lineage", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const lineage = buildArtifactEvidenceLineage(record.artifacts);
    response.json({
      lineage,
      artifacts: record.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactType: artifact.artifactType,
        artifactClass: artifact.artifactClass,
        semanticType: artifact.semanticType,
        title: artifact.title,
        summary: artifact.summary,
        derivedFromArtifactIds: artifact.derivedFromArtifactIds,
        provenance: artifact.provenance,
      })),
      meta: {
        artifactCount: record.artifacts.length,
        edgeCount: lineage.edges.length,
      },
    });
  });

  app.post("/api/cases/:caseId/samples", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = registerSampleSchema.parse(request.body ?? {});
    const nextCase = registerSample(record, input);
    const sample = nextCase.samples.at(-1);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId: nextCase.caseId,
        eventType: "sample.registered",
        action: "register_sample",
        occurredAt: sample?.registeredAt ?? nextCase.updatedAt,
        details: {
          sampleType: sample?.sampleType ?? input.sampleType,
          assayType: sample?.assayType ?? input.assayType,
          sourceSite: sample?.sourceSite ?? input.sourceSite,
        },
      },
    );
    response.status(201).json({ case: nextCase });
  });

  app.post("/api/cases/:caseId/study-context", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = attachStudyContextSchema.parse(request.body ?? {});
    const nextCase = attachStudyContext(record, input);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId: nextCase.caseId,
        eventType: "study-context.attached",
        action: "attach_study_context",
        occurredAt: nextCase.studyContext?.receivedAt ?? nextCase.updatedAt,
        details: {
          source: nextCase.studyContext?.source ?? input.source,
          seriesCount: nextCase.studyContext?.series.length ?? 0,
          hasDicomWebBaseUrl: Boolean(nextCase.studyContext?.dicomWebBaseUrl),
        },
      },
    );
    response.json({ case: nextCase });
  });

  app.post("/api/cases/:caseId/qc-summary", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = recordQcSummarySchema.parse(request.body ?? {});
    const nextCase = recordQcSummary(record, input);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      response,
      {
        caseId: nextCase.caseId,
        eventType: "qc.recorded",
        action: "record_qc_summary",
        occurredAt: nextCase.qcSummary?.checkedAt ?? nextCase.updatedAt,
        details: {
          disposition: nextCase.qcSummary?.disposition ?? input.disposition,
          issueCount: nextCase.qcSummary?.issues.length ?? 0,
          checkCount: nextCase.qcSummary?.checks.length ?? 0,
          metricCount: nextCase.qcSummary?.metrics.length ?? 0,
        },
      },
    );
    response.json({ case: nextCase });
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