import type { Express, Request, RequestHandler, Response } from "express";
import {
  addArtifact,
  attachStudyContext,
  buildArtifactEvidenceLineage,
  canPrincipalAccessCase,
  createCase,
  filterCasesForPrincipal,
  grantCaseAccess,
  recordQcSummary,
  registerSample,
  removeArtifact,
} from "../../domain/anamnesis";
import { clampPagination } from "../../domain/anamnesis/store-contracts";
import {
  addArtifactSchema,
  attachStudyContextSchema,
  createCaseSchema,
  grantCaseAccessSchema,
  recordQcSummarySchema,
  registerSampleSchema,
} from "./schemas";
import {
  appendAuditEvent,
  loadCaseOrRespondNotFound,
  readRouteParam,
  respondCaseNotFound,
  type RouteDependencies,
} from "./shared";

function respondForbidden(response: Response, message: string): void {
  response.status(403).json({
    code: "forbidden",
    message,
  });
}

function canManageCaseAccess(record: { accessControl?: { ownerPrincipalId: string } }, principal?: Request["principal"]): boolean {
  if (!principal) {
    return false;
  }

  if (principal.authMechanism === "api-key") {
    return true;
  }

  return principal.authMechanism === "jwt-bearer"
    && record.accessControl?.ownerPrincipalId === principal.actorId;
}

export function registerCaseRoutes(
  app: Express,
  { store, auditStore }: RouteDependencies,
  parseJson: RequestHandler,
): void {
  app.post("/api/cases", parseJson, async (request, response) => {
    const input = createCaseSchema.parse(request.body ?? {});
    const ownerPrincipalId = request.principal?.authMechanism === "jwt-bearer"
      ? request.principal.actorId
      : undefined;
    const record = createCase(input, new Date(), { ownerPrincipalId });
    await store.saveCase(record);
    await appendAuditEvent(
      auditStore,
      request,
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

  app.get("/api/cases", async (request, response) => {
    const pagination = clampPagination({
      limit: request.query.limit ? Number(request.query.limit) : undefined,
      offset: request.query.offset ? Number(request.query.offset) : undefined,
    });
    const allCases = request.principal?.authMechanism === "jwt-bearer"
      ? filterCasesForPrincipal(await store.listCases(), request.principal)
      : await store.listCases();
    const cases = allCases.slice(pagination.offset, pagination.offset + pagination.limit);
    response.json({
      cases,
      meta: {
        returnedCount: cases.length,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    });
  });

  app.get("/api/cases/:caseId", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    response.json({ case: record });
  });

  app.post("/api/cases/:caseId/access-grants", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    if (!canManageCaseAccess(record, request.principal)) {
      respondForbidden(response, "Only the case owner or API-key operator can grant case access.");
      return;
    }

    const input = grantCaseAccessSchema.parse(request.body ?? {});
    const nextCase = grantCaseAccess(record, input.principalId);
    if (nextCase !== record) {
      await store.saveCase(nextCase);
      await appendAuditEvent(
        auditStore,
        request,
        response,
        {
          caseId: nextCase.caseId,
          eventType: "case.shared",
          action: "grant_case_access",
          occurredAt: nextCase.updatedAt,
          details: {
            sharedPrincipalId: input.principalId,
          },
        },
      );
    }

    response.json({ case: nextCase });
  });

  app.get("/api/cases/:caseId/evidence-lineage", async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
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
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = registerSampleSchema.parse(request.body ?? {});
    const nextCase = registerSample(record, input);
    const sample = nextCase.samples.at(-1);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      request,
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
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = attachStudyContextSchema.parse(request.body ?? {});
    const nextCase = attachStudyContext(record, input);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      request,
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
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = recordQcSummarySchema.parse(request.body ?? {});
    const nextCase = recordQcSummary(record, input);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      request,
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
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = addArtifactSchema.parse(request.body ?? {});
    const nextCase = addArtifact(record, input);
    await store.saveCase(nextCase);
    const artifact = nextCase.artifacts.at(-1);
    await appendAuditEvent(
      auditStore,
      request,
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
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const artifactId = readRouteParam(request.params.artifactId);
    const removedArtifact = record.artifacts.find((artifact) => artifact.artifactId === artifactId);
    const nextCase = removeArtifact(record, artifactId);
    await store.saveCase(nextCase);
    await appendAuditEvent(
      auditStore,
      request,
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
    const record = await loadCaseOrRespondNotFound(store, request, response, caseId);
    if (!record) {
      return;
    }

    await store.deleteCase(caseId);
    await appendAuditEvent(
      auditStore,
      request,
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
    const pagination = clampPagination({
      limit: request.query.limit ? Number(request.query.limit) : undefined,
      offset: request.query.offset ? Number(request.query.offset) : undefined,
    });
    const record = await store.getCase(caseId);
    if (record && !canPrincipalAccessCase(record, request.principal)) {
      respondCaseNotFound(response);
      return;
    }

    const events = await auditStore.listByCase(caseId, pagination);
    if (!record && request.principal?.authMechanism === "jwt-bearer") {
      const allowedPrincipalIds = new Set<string>();
      const creatorActorId = events.find((event) => event.eventType === "case.created")?.actorId;
      if (creatorActorId && creatorActorId !== "api-key-holder") {
        allowedPrincipalIds.add(creatorActorId);
      }

      for (const event of events) {
        if (event.eventType === "case.shared") {
          const sharedPrincipalId = typeof event.details?.sharedPrincipalId === "string"
            ? event.details.sharedPrincipalId
            : undefined;
          if (sharedPrincipalId) {
            allowedPrincipalIds.add(sharedPrincipalId);
          }
        }
      }

      if (
        allowedPrincipalIds.size > 0
        && !allowedPrincipalIds.has(request.principal.actorId)
      ) {
        respondCaseNotFound(response);
        return;
      }
    }

    response.json({
      events,
      meta: {
        returnedCount: events.length,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    });
  });
}