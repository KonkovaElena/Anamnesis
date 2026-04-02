import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { ZodError, z } from "zod";
import {
  type AuditTrailStore,
  type ExternalAttachmentFetcher,
  type OperationsSummary,
  AnamnesisDomainError,
  type AnamnesisCase,
  type AnamnesisStore,
  addArtifact,
  buildOperationsSummary,
  createAuditEvent,
  createCase,
  draftPhysicianPacket,
  ingestFhirBundle,
  ingestFhirResource,
  finalizePhysicianPacket,
  ingestDocument,
  removeArtifact,
  submitReview,
} from "../domain/anamnesis";

const sourceDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    },
    { message: "sourceDate must be a valid calendar date in YYYY-MM-DD format" },
  )
  .refine(
    (value) => new Date(`${value}T00:00:00Z`) <= new Date(),
    { message: "sourceDate must not be in the future" },
  );

const createCaseSchema = z.strictObject({
  patientLabel: z.string().trim().min(1).max(120).optional(),
  intake: z.strictObject({
    chiefConcern: z.string().trim().min(1).max(200),
    symptomSummary: z.string().trim().min(1).max(4000),
    historySummary: z.string().trim().min(1).max(4000),
    questionsForClinician: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  }),
});

const addArtifactSchema = z.strictObject({
  artifactType: z.enum(["note", "lab", "summary", "report", "imaging-summary"]),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
});

const documentIngestionSchema = z.strictObject({
  artifactType: z.enum(["note", "lab", "summary", "report", "imaging-summary"]),
  title: z.string().trim().min(1).max(200),
  contentType: z.enum(["text/plain", "text/markdown"]),
  content: z.string().min(1).max(12000),
  filename: z.string().trim().min(1).max(160).optional(),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
});

const fhirImportSchema = z.strictObject({
  artifactType: z.enum(["note", "lab", "summary", "report", "imaging-summary"]).default("report"),
  title: z.string().trim().min(1).max(200).optional(),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
  resource: z.record(z.string(), z.unknown()),
});

const fhirBundleImportSchema = z.strictObject({
  artifactType: z.enum(["note", "lab", "summary", "report", "imaging-summary"]).default("report"),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
  allowExternalAttachmentFetch: z.boolean().default(false),
  resource: z.record(z.string(), z.unknown()),
});

const createPacketSchema = z.strictObject({
  requestedBy: z.string().trim().min(1).max(120).optional(),
  focus: z.string().trim().min(1).max(300).optional(),
});

const submitReviewSchema = z.strictObject({
  reviewerName: z.string().trim().min(1).max(120),
  action: z.enum(["approved", "changes_requested", "rejected"]),
  comments: z.string().trim().min(1).max(4000).optional(),
});

const finalizePacketSchema = z.strictObject({
  finalizedBy: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(4000).optional(),
});

interface CreateAppDependencies {
  store: AnamnesisStore;
  auditStore: AuditTrailStore;
  isShuttingDown?: () => boolean;
  authMiddleware?: (request: Request, response: Response, next: NextFunction) => void;
  rateLimitRpm?: number;
  externalAttachmentFetcher?: ExternalAttachmentFetcher;
}

function readRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isMalformedJsonError(
  error: unknown,
): error is SyntaxError & { status: 400; type: "entity.parse.failed" } {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const candidate = error as SyntaxError & Partial<{ status: number; type: string }>;
  return candidate.status === 400 && candidate.type === "entity.parse.failed";
}

async function loadOperationsSummary(
  store: AnamnesisStore,
  auditStore: AuditTrailStore,
): Promise<OperationsSummary> {
  const cases = await store.listCases();
  const totalAuditEvents = await auditStore.countEvents();
  return buildOperationsSummary(cases, { totalAuditEvents });
}

function renderMetrics(summary: OperationsSummary): string {
  const lines = [
    "# HELP anamnesis_cases_total Total number of anamnesis cases.",
    "# TYPE anamnesis_cases_total gauge",
    `anamnesis_cases_total ${summary.totalCases}`,
    "# HELP anamnesis_artifacts_total Total number of registered source artifacts.",
    "# TYPE anamnesis_artifacts_total gauge",
    `anamnesis_artifacts_total ${summary.totalArtifacts}`,
    "# HELP anamnesis_packets_total Total number of physician packet drafts.",
    "# TYPE anamnesis_packets_total gauge",
    `anamnesis_packets_total ${summary.totalPackets}`,
    "# HELP anamnesis_reviews_total Total number of clinician review entries.",
    "# TYPE anamnesis_reviews_total gauge",
    `anamnesis_reviews_total ${summary.totalReviews}`,
    "# HELP anamnesis_finalized_packets_total Total number of finalized physician packets.",
    "# TYPE anamnesis_finalized_packets_total gauge",
    `anamnesis_finalized_packets_total ${summary.totalFinalizedPackets}`,
    "# HELP anamnesis_audit_events_total Total number of audit trail events.",
    "# TYPE anamnesis_audit_events_total gauge",
    `anamnesis_audit_events_total ${summary.totalAuditEvents}`,
    "# HELP anamnesis_cases_by_status Total cases by workflow status.",
    "# TYPE anamnesis_cases_by_status gauge",
  ];

  for (const [status, count] of Object.entries(summary.statusCounts)) {
    lines.push(`anamnesis_cases_by_status{status="${status}"} ${count}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createApp({ store, auditStore, isShuttingDown, authMiddleware, rateLimitRpm, externalAttachmentFetcher }: CreateAppDependencies) {
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
    const { createRateLimiter } = require("./rate-limiter") as typeof import("./rate-limiter");
    app.use(
      createRateLimiter({
        windowMs: 60_000,
        maxRequests: rateLimitRpm,
        skipPaths: new Set(["/healthz", "/readyz"]),
      }),
    );
  }
  app.post("/api/cases", parseJson, async (request, response) => {
    const input = createCaseSchema.parse(request.body ?? {});
    const record = createCase(input);
    await store.saveCase(record);
    await auditStore.append(
      createAuditEvent({
        caseId: record.caseId,
        eventType: "case.created",
        action: "create_case",
        occurredAt: record.createdAt,
        details: {
          hasPatientLabel: Boolean(record.patientLabel),
        },
      }),
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
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    response.json({ case: record });
  });

  app.post("/api/cases/:caseId/artifacts", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = addArtifactSchema.parse(request.body ?? {});
    const nextCase = addArtifact(record, input);
    await store.saveCase(nextCase);
    const artifact = nextCase.artifacts.at(-1);
    await auditStore.append(
      createAuditEvent({
        caseId: nextCase.caseId,
        eventType: "artifact.added",
        action: "add_artifact",
        occurredAt: artifact?.createdAt ?? nextCase.updatedAt,
        details: {
          artifactType: artifact?.artifactType ?? input.artifactType,
          hasSourceDate: Boolean(artifact?.sourceDate ?? input.sourceDate),
        },
      }),
    );
    response.status(201).json({ case: nextCase });
  });

  app.post("/api/cases/:caseId/document-ingestions", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = documentIngestionSchema.parse(request.body ?? {});
    const result = ingestDocument(record, input);
    await store.saveCase(result.nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: result.nextCase.caseId,
        eventType: "document.ingested",
        action: "ingest_document",
        occurredAt: result.artifact.createdAt,
        details: {
          artifactType: input.artifactType,
          contentType: result.ingestion.contentType,
          hasFilename: Boolean(result.ingestion.filename),
          truncated: result.ingestion.truncated,
          normalizedCharacters: result.ingestion.normalizedCharacterCount,
        },
      }),
    );
    response.status(201).json({
      case: result.nextCase,
      artifact: result.artifact,
      ingestion: result.ingestion,
    });
  });

  app.post("/api/cases/:caseId/fhir-imports", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = fhirImportSchema.parse(request.body ?? {});
    const result = ingestFhirResource(record, input);
    await store.saveCase(result.nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: result.nextCase.caseId,
        eventType: "fhir.imported",
        action: "import_fhir",
        occurredAt: result.artifact.createdAt,
        details: {
          artifactType: result.artifact.artifactType,
          resourceType: result.fhirImport.resourceType,
          sourceContentType: result.fhirImport.sourceContentType,
          truncated: result.ingestion.truncated,
          normalizedCharacters: result.ingestion.normalizedCharacterCount,
        },
      }),
    );
    response.status(201).json({
      case: result.nextCase,
      artifact: result.artifact,
      ingestion: result.ingestion,
      fhirImport: result.fhirImport,
    });
  });

  app.post("/api/cases/:caseId/fhir-bundle-imports", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = fhirBundleImportSchema.parse(request.body ?? {});
    const result = await ingestFhirBundle(record, input, {
      externalAttachmentFetcher,
    });
    await store.saveCase(result.nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: result.nextCase.caseId,
        eventType: "fhir.bundle.imported",
        action: "import_fhir_bundle",
        occurredAt: result.artifacts[0]?.createdAt ?? result.nextCase.updatedAt,
        details: {
          artifactCount: result.artifacts.length,
          bundleType: result.bundleImport.bundleType,
          usedExternalAttachmentFetch: result.bundleImport.usedExternalAttachmentFetch,
          truncatedCount: result.ingestions.filter((ingestion) => ingestion.truncated).length,
        },
      }),
    );
    response.status(201).json({
      case: result.nextCase,
      artifacts: result.artifacts,
      ingestions: result.ingestions,
      bundleImport: result.bundleImport,
    });
  });

  app.post("/api/cases/:caseId/physician-packets", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const input = createPacketSchema.parse(request.body ?? {});
    const result = draftPhysicianPacket(record, input);
    await store.saveCase(result.nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: result.nextCase.caseId,
        packetId: result.packet.packetId,
        eventType: "packet.drafted",
        action: "draft_packet",
        occurredAt: result.packet.createdAt,
        actorId: result.packet.requestedBy,
        details: {
          artifactCount: result.packet.artifactIds.length,
          hasFocus: Boolean(result.packet.focus),
        },
      }),
    );
    response.status(201).json({
      case: result.nextCase,
      packet: result.packet,
    });
  });

  app.get("/api/cases/:caseId/physician-packets", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    response.json({
      physicianPackets: record.physicianPackets,
      meta: {
        totalPackets: record.physicianPackets.length,
      },
    });
  });

  app.post("/api/cases/:caseId/physician-packets/:packetId/reviews", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const input = submitReviewSchema.parse(request.body ?? {});
    const result = submitReview(record, packetId, input);
    await store.saveCase(result.nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: result.nextCase.caseId,
        packetId,
        eventType: "review.submitted",
        action: "submit_review",
        occurredAt: result.review.createdAt,
        actorId: result.review.reviewerName,
        details: {
          reviewAction: result.review.action,
          hasComments: Boolean(result.review.comments),
        },
      }),
    );
    response.status(201).json({
      review: result.review,
    });
  });

  app.post("/api/cases/:caseId/physician-packets/:packetId/finalize", parseJson, async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const input = finalizePacketSchema.parse(request.body ?? {});
    const result = finalizePhysicianPacket(record, packetId, input);
    await store.saveCase(result.nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: result.nextCase.caseId,
        packetId,
        eventType: "packet.finalized",
        action: "finalize_packet",
        occurredAt: result.packet.finalizedAt ?? result.nextCase.updatedAt,
        actorId: result.packet.finalizedBy,
        details: {
          hasReason: Boolean(result.packet.finalizationReason),
          fingerprint: result.packet.finalizedFingerprint ?? null,
        },
      }),
    );
    response.json({
      case: result.nextCase,
      packet: result.packet,
    });
  });

  app.get("/api/cases/:caseId/physician-packets/:packetId/reviews", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const packetId = readRouteParam(request.params.packetId);
    const packet = record.physicianPackets.find((p) => p.packetId === packetId);
    if (!packet) {
      response.status(404).json({
        code: "packet_not_found",
        message: "Physician packet not found.",
      });
      return;
    }

    response.json({
      reviews: packet.reviews,
      meta: {
        totalReviews: packet.reviews.length,
        packetStatus: packet.status,
      },
    });
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

  app.delete("/api/cases/:caseId/artifacts/:artifactId", async (request, response) => {
    const record = await store.getCase(readRouteParam(request.params.caseId));
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    const artifactId = readRouteParam(request.params.artifactId);
    const removedArtifact = record.artifacts.find((artifact) => artifact.artifactId === artifactId);
    const nextCase = removeArtifact(record, artifactId);
    await store.saveCase(nextCase);
    await auditStore.append(
      createAuditEvent({
        caseId: nextCase.caseId,
        eventType: "artifact.removed",
        action: "remove_artifact",
        occurredAt: nextCase.updatedAt,
        details: {
          artifactId,
          artifactType: removedArtifact?.artifactType ?? "unknown",
        },
      }),
    );
    response.json({ case: nextCase });
  });

  app.delete("/api/cases/:caseId", async (request, response) => {
    const caseId = readRouteParam(request.params.caseId);
    const record = await store.getCase(caseId);
    if (!record) {
      response.status(404).json({
        code: "case_not_found",
        message: "Case not found.",
      });
      return;
    }

    await store.deleteCase(caseId);
    await auditStore.append(
      createAuditEvent({
        caseId,
        eventType: "case.deleted",
        action: "delete_case",
        occurredAt: new Date().toISOString(),
        details: {
          artifactCount: record.artifacts.length,
          packetCount: record.physicianPackets.length,
        },
      }),
    );

    response.status(204).end();
  });

  app.get("/metrics", async (_request, response) => {
    const summary = await loadOperationsSummary(store, auditStore);
    response.type("text/plain").send(renderMetrics(summary));
  });

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
