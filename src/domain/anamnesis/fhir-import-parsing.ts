import {
  classifyFhirBundleProfile,
  classifyFhirImportProfile,
} from "../../core/normalization-profiles";
import {
  appendFhirProvenance,
  appendProvenance,
  decodeBase64Utf8,
  deriveSourceDate,
  isRecord,
  parseDocumentContentType,
  readOptionalString,
} from "./document-import-utils";
import {
  AnamnesisDomainError,
  type ArtifactType,
  type DocumentContentType,
  type ExternalAttachmentFetcher,
  type FhirBundleImportInput,
  type FhirBundleType,
  type FhirImportInput,
  type FhirImportResourceType,
} from "./contracts";
import { parseBinaryImport } from "./fhir-binary-import-parsing";

export interface ParsedFhirImport {
  artifactType: ArtifactType;
  title: string;
  sourceDate?: string;
  provenance?: string;
  resourceType: FhirImportResourceType;
  importProfile: string;
  sourceContentType: DocumentContentType;
  textContent: string;
}

export interface ParsedBundleImport {
  bundleType: FhirBundleType;
  bundleProfile: string;
  entries: ParsedFhirImport[];
  usedExternalAttachmentFetch: boolean;
}

interface BundleDocumentReferenceAttachment {
  contentType?: DocumentContentType;
  url: string;
  title?: string;
  creation?: string;
}

function parseDocumentReferenceImport(input: FhirImportInput): ParsedFhirImport {
  const content = input.resource.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new AnamnesisDomainError(
      "fhir_import_requires_inline_data",
      400,
      "FHIR import requires an inline text attachment on DocumentReference.content.",
    );
  }

  let sawInlineData = false;
  let sawExternalUrl = false;
  let sawUnsupportedContentType = false;
  let attachmentTitle: string | undefined;
  let attachmentCreation: string | undefined;
  let selectedContentType: DocumentContentType | undefined;
  let selectedData: string | undefined;

  for (const item of content) {
    if (!isRecord(item) || !isRecord(item.attachment)) {
      continue;
    }

    const attachment = item.attachment;
    const attachmentContentType = parseDocumentContentType(readOptionalString(attachment.contentType));
    const attachmentData = readOptionalString(attachment.data);
    const attachmentUrl = readOptionalString(attachment.url);

    attachmentTitle ??= readOptionalString(attachment.title);
    attachmentCreation ??= readOptionalString(attachment.creation);

    if (attachmentData) {
      sawInlineData = true;
    }
    if (attachmentUrl) {
      sawExternalUrl = true;
    }
    if (!attachmentContentType && (attachmentData || attachmentUrl)) {
      sawUnsupportedContentType = true;
    }

    if (attachmentContentType && attachmentData) {
      selectedContentType = attachmentContentType;
      selectedData = attachmentData;
      break;
    }
  }

  if (!selectedContentType || !selectedData) {
    if (sawUnsupportedContentType || sawInlineData) {
      throw new AnamnesisDomainError(
        "fhir_import_content_type_unsupported",
        400,
        "FHIR DocumentReference import only supports inline text/plain or text/markdown attachments in this slice.",
      );
    }

    if (sawExternalUrl) {
      throw new AnamnesisDomainError(
        "fhir_import_requires_inline_data",
        400,
        "FHIR import requires inline attachment data. External dereference is out of scope.",
      );
    }

    throw new AnamnesisDomainError(
      "fhir_import_requires_inline_data",
      400,
      "FHIR import requires an inline text attachment on DocumentReference.content.",
    );
  }

  return {
    artifactType: input.artifactType ?? "report",
    title:
      input.title ??
      readOptionalString(input.resource.description) ??
      attachmentTitle ??
      "FHIR DocumentReference import",
    sourceDate:
      input.sourceDate ??
      deriveSourceDate(readOptionalString(input.resource.date)) ??
      deriveSourceDate(attachmentCreation),
    provenance: appendFhirProvenance(input.provenance, "DocumentReference"),
    resourceType: "DocumentReference",
    importProfile: classifyFhirImportProfile("DocumentReference", "inline"),
    sourceContentType: selectedContentType,
    textContent: decodeBase64Utf8(selectedData),
  };
}

export function parseFhirImport(input: FhirImportInput): ParsedFhirImport {
  const resourceType = readOptionalString(input.resource.resourceType);
  if (resourceType === "Binary") {
    return parseBinaryImport(input);
  }
  if (resourceType === "DocumentReference") {
    return parseDocumentReferenceImport(input);
  }

  throw new AnamnesisDomainError(
    "fhir_import_resource_unsupported",
    400,
    "FHIR import only supports Binary and DocumentReference resources in this slice.",
  );
}

function findExternalDocumentReferenceAttachment(
  resource: Record<string, unknown>,
): BundleDocumentReferenceAttachment | undefined {
  const content = resource.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  for (const item of content) {
    if (!isRecord(item) || !isRecord(item.attachment)) {
      continue;
    }

    const attachment = item.attachment;
    const url = readOptionalString(attachment.url);
    if (!url) {
      continue;
    }

    return {
      contentType: parseDocumentContentType(readOptionalString(attachment.contentType)),
      url,
      title: readOptionalString(attachment.title),
      creation: readOptionalString(attachment.creation),
    };
  }

  return undefined;
}

async function parseDocumentReferenceImportFromExternalAttachment(
  input: FhirBundleImportInput,
  resource: Record<string, unknown>,
  entryIndex: number,
  externalAttachmentFetcher: ExternalAttachmentFetcher,
): Promise<ParsedFhirImport> {
  const attachment = findExternalDocumentReferenceAttachment(resource);
  if (!attachment) {
    throw new AnamnesisDomainError(
      "fhir_import_requires_inline_data",
      400,
      "FHIR import requires inline attachment data. External dereference is out of scope.",
    );
  }

  const fetchedAttachment = await externalAttachmentFetcher(attachment.url).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "External attachment fetch failed.";
    throw new AnamnesisDomainError(
      "fhir_import_external_fetch_failed",
      400,
      message,
    );
  });

  const sourceContentType = parseDocumentContentType(fetchedAttachment.contentType) ?? attachment.contentType;
  if (!sourceContentType) {
    throw new AnamnesisDomainError(
      "fhir_import_content_type_unsupported",
      400,
      "FHIR DocumentReference import only supports text/plain or text/markdown attachments in this slice.",
    );
  }

  return {
    artifactType: input.artifactType ?? "report",
    title:
      readOptionalString(resource.description) ??
      attachment.title ??
      "FHIR DocumentReference import",
    sourceDate:
      input.sourceDate ??
      deriveSourceDate(readOptionalString(resource.date)) ??
      deriveSourceDate(attachment.creation),
    provenance: appendProvenance(
      appendProvenance(
        appendFhirProvenance(input.provenance, "DocumentReference"),
        `bundle-entry:${entryIndex}`,
      ),
      `attachment-url:${attachment.url}`,
    ),
    resourceType: "DocumentReference",
    importProfile: classifyFhirImportProfile("DocumentReference", "external"),
    sourceContentType,
    textContent: fetchedAttachment.content,
  };
}

export async function parseFhirBundle(
  input: FhirBundleImportInput,
  dependencies?: { externalAttachmentFetcher?: ExternalAttachmentFetcher },
): Promise<ParsedBundleImport> {
  if (readOptionalString(input.resource.resourceType) !== "Bundle") {
    throw new AnamnesisDomainError(
      "fhir_import_resource_unsupported",
      400,
      "FHIR Bundle import requires a Bundle resource in this slice.",
    );
  }

  const bundleType = readOptionalString(input.resource.type);
  if (bundleType !== "document" && bundleType !== "collection") {
    throw new AnamnesisDomainError(
      "fhir_import_bundle_type_unsupported",
      400,
      "FHIR Bundle import only supports document or collection bundle types in this slice.",
    );
  }

  const entries = input.resource.entry;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new AnamnesisDomainError(
      "fhir_import_bundle_empty",
      400,
      "FHIR Bundle import requires at least one entry resource in this slice.",
    );
  }

  const parsedEntries: ParsedFhirImport[] = [];
  let usedExternalAttachmentFetch = false;

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    if (!isRecord(entry) || !isRecord(entry.resource)) {
      continue;
    }

    const resource = entry.resource;
    const resourceType = readOptionalString(resource.resourceType);
    const provenance = appendProvenance(input.provenance, `bundle-entry:${entryIndex}`);

    if (resourceType === "Binary") {
      parsedEntries.push(
        parseBinaryImport({
          artifactType: input.artifactType,
          sourceDate: input.sourceDate,
          provenance,
          resource,
        }),
      );
      continue;
    }

    if (resourceType !== "DocumentReference") {
      continue;
    }

    try {
      parsedEntries.push(
        parseDocumentReferenceImport({
          artifactType: input.artifactType,
          sourceDate: input.sourceDate,
          provenance,
          resource,
        }),
      );
      continue;
    } catch (error: unknown) {
      if (!(error instanceof AnamnesisDomainError)) {
        throw error;
      }

      if (
        error.code !== "fhir_import_requires_inline_data"
        || !input.allowExternalAttachmentFetch
        || !dependencies?.externalAttachmentFetcher
      ) {
        throw error;
      }
    }

    parsedEntries.push(
      await parseDocumentReferenceImportFromExternalAttachment(
        {
          artifactType: input.artifactType,
          sourceDate: input.sourceDate,
          provenance,
          allowExternalAttachmentFetch: input.allowExternalAttachmentFetch,
          resource: input.resource,
        },
        resource,
        entryIndex,
        dependencies.externalAttachmentFetcher,
      ),
    );
    usedExternalAttachmentFetch = true;
  }

  if (parsedEntries.length === 0) {
    throw new AnamnesisDomainError(
      "fhir_import_bundle_empty",
      400,
      "FHIR Bundle import requires at least one supported Binary or DocumentReference entry in this slice.",
    );
  }

  return {
    bundleType,
    bundleProfile: classifyFhirBundleProfile(bundleType),
    entries: parsedEntries,
    usedExternalAttachmentFetch,
  };
}