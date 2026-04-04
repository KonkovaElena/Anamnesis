import {
  classifyDocumentNormalizationProfile,
} from "../../core/normalization-profiles";
import { addArtifact } from "./case-workflow";
import {
  buildDocumentExcerpt,
  buildDocumentProvenance,
  normalizeDocumentText,
} from "./document-import-utils";
import { parseFhirBundle, parseFhirImport } from "./fhir-import-parsing";
import {
  type AnamnesisCase,
  AnamnesisDomainError,
  type DocumentIngestionResult,
  type ExternalAttachmentFetcher,
  type FhirBundleImportInput,
  type FhirBundleImportResult,
  type FhirImportInput,
  type FhirImportResult,
  type IngestDocumentInput,
  type SourceArtifact,
} from "./contracts";

export function ingestDocument(
  record: AnamnesisCase,
  input: IngestDocumentInput,
  now = new Date(),
): { nextCase: AnamnesisCase; artifact: SourceArtifact; ingestion: DocumentIngestionResult } {
  const normalized = normalizeDocumentText(input.content);
  if (normalized.length === 0) {
    throw new AnamnesisDomainError(
      "document_content_empty",
      400,
      "Document content must contain at least one non-whitespace character.",
    );
  }

  const excerpt = buildDocumentExcerpt(normalized);
  const nextCase = addArtifact(
    record,
    {
      artifactType: input.artifactType,
      title: input.title,
      summary: excerpt.excerpt,
      sourceDate: input.sourceDate,
      provenance: buildDocumentProvenance(input),
    },
    now,
  );

  const artifact = nextCase.artifacts.at(-1);
  if (!artifact) {
    throw new AnamnesisDomainError(
      "artifact_creation_failed",
      500,
      "Document ingestion did not create a source artifact.",
    );
  }

  return {
    nextCase,
    artifact,
    ingestion: {
      contentType: input.contentType,
      filename: input.filename,
      normalizedCharacterCount: normalized.length,
      excerptCharacterCount: excerpt.excerpt.length,
      truncated: excerpt.truncated,
      normalizationProfile: classifyDocumentNormalizationProfile(input.contentType),
    },
  };
}

export function ingestFhirResource(
  record: AnamnesisCase,
  input: FhirImportInput,
  now = new Date(),
): {
  nextCase: AnamnesisCase;
  artifact: SourceArtifact;
  ingestion: DocumentIngestionResult;
  fhirImport: FhirImportResult;
} {
  const parsed = parseFhirImport(input);
  const result = ingestDocument(
    record,
    {
      artifactType: parsed.artifactType,
      title: parsed.title,
      contentType: parsed.sourceContentType,
      content: parsed.textContent,
      sourceDate: parsed.sourceDate,
      provenance: parsed.provenance,
    },
    now,
  );

  return {
    ...result,
    fhirImport: {
      resourceType: parsed.resourceType,
      transportContentType: "application/fhir+json",
      sourceContentType: parsed.sourceContentType,
      importProfile: parsed.importProfile,
      title: parsed.title,
      sourceDate: parsed.sourceDate,
    },
  };
}

export async function ingestFhirBundle(
  record: AnamnesisCase,
  input: FhirBundleImportInput,
  dependencies?: { externalAttachmentFetcher?: ExternalAttachmentFetcher },
  now = new Date(),
): Promise<{
  nextCase: AnamnesisCase;
  artifacts: SourceArtifact[];
  ingestions: DocumentIngestionResult[];
  bundleImport: FhirBundleImportResult;
}> {
  const parsedBundle = await parseFhirBundle(input, dependencies);
  let nextCase = record;
  const artifacts: SourceArtifact[] = [];
  const ingestions: DocumentIngestionResult[] = [];

  for (const parsedEntry of parsedBundle.entries) {
    const result = ingestDocument(
      nextCase,
      {
        artifactType: parsedEntry.artifactType,
        title: parsedEntry.title,
        contentType: parsedEntry.sourceContentType,
        content: parsedEntry.textContent,
        sourceDate: parsedEntry.sourceDate,
        provenance: parsedEntry.provenance,
      },
      now,
    );

    nextCase = result.nextCase;
    artifacts.push(result.artifact);
    ingestions.push(result.ingestion);
  }

  return {
    nextCase,
    artifacts,
    ingestions,
    bundleImport: {
      resourceType: "Bundle",
      bundleType: parsedBundle.bundleType,
      bundleProfile: parsedBundle.bundleProfile,
      entryProfiles: parsedBundle.entries.map((entry) => entry.importProfile),
      artifactCount: artifacts.length,
      transportContentType: "application/fhir+json",
      usedExternalAttachmentFetch: parsedBundle.usedExternalAttachmentFetch,
    },
  };
}