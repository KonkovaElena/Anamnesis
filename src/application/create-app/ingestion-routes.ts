import type { Express, RequestHandler } from "express";
import { ingestDocument, ingestFhirBundle, ingestFhirResource } from "../../domain/anamnesis";
import { documentIngestionSchema, fhirBundleImportSchema, fhirImportSchema } from "./schemas";
import {
  appendAuditEvent,
  loadCaseOrRespondNotFound,
  readRouteParam,
  type RouteDependencies,
} from "./shared";

export function registerIngestionRoutes(
  app: Express,
  { store, auditStore, externalAttachmentFetcher }: RouteDependencies,
  parseJson: RequestHandler,
): void {
  app.post("/api/cases/:caseId/document-ingestions", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = documentIngestionSchema.parse(request.body ?? {});
    const result = ingestDocument(record, input);
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
      request,
      response,
      {
        caseId: result.nextCase.caseId,
        eventType: "document.ingested",
        action: "ingest_document",
        occurredAt: result.artifact.createdAt,
        details: {
          artifactType: input.artifactType,
          contentType: result.ingestion.contentType,
          normalizationProfile: result.ingestion.normalizationProfile,
          hasFilename: Boolean(result.ingestion.filename),
          truncated: result.ingestion.truncated,
          normalizedCharacters: result.ingestion.normalizedCharacterCount,
        },
      },
    );
    response.status(201).json({
      case: result.nextCase,
      artifact: result.artifact,
      ingestion: result.ingestion,
    });
  });

  app.post("/api/cases/:caseId/fhir-imports", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = fhirImportSchema.parse(request.body ?? {});
    const result = ingestFhirResource(record, input);
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
      request,
      response,
      {
        caseId: result.nextCase.caseId,
        eventType: "fhir.imported",
        action: "import_fhir",
        occurredAt: result.artifact.createdAt,
        details: {
          artifactType: result.artifact.artifactType,
          resourceType: result.fhirImport.resourceType,
          sourceContentType: result.fhirImport.sourceContentType,
          importProfile: result.fhirImport.importProfile,
          normalizationProfile: result.ingestion.normalizationProfile,
          truncated: result.ingestion.truncated,
          normalizedCharacters: result.ingestion.normalizedCharacterCount,
        },
      },
    );
    response.status(201).json({
      case: result.nextCase,
      artifact: result.artifact,
      ingestion: result.ingestion,
      fhirImport: result.fhirImport,
    });
  });

  app.post("/api/cases/:caseId/fhir-bundle-imports", parseJson, async (request, response) => {
    const record = await loadCaseOrRespondNotFound(store, request, response, readRouteParam(request.params.caseId));
    if (!record) {
      return;
    }

    const input = fhirBundleImportSchema.parse(request.body ?? {});
    const result = await ingestFhirBundle(record, input, {
      externalAttachmentFetcher,
    });
    await store.saveCase(result.nextCase);
    await appendAuditEvent(
      auditStore,
      request,
      response,
      {
        caseId: result.nextCase.caseId,
        eventType: "fhir.bundle.imported",
        action: "import_fhir_bundle",
        occurredAt: result.artifacts[0]?.createdAt ?? result.nextCase.updatedAt,
        details: {
          artifactCount: result.artifacts.length,
          bundleType: result.bundleImport.bundleType,
          bundleProfile: result.bundleImport.bundleProfile,
          entryProfiles: result.bundleImport.entryProfiles.join(","),
          usedExternalAttachmentFetch: result.bundleImport.usedExternalAttachmentFetch,
          truncatedCount: result.ingestions.filter((ingestion) => ingestion.truncated).length,
        },
      },
    );
    response.status(201).json({
      case: result.nextCase,
      artifacts: result.artifacts,
      ingestions: result.ingestions,
      bundleImport: result.bundleImport,
    });
  });
}