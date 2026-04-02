import { createHash, randomUUID } from "node:crypto";

export type CaseStatus = "INTAKING" | "READY_FOR_PACKET" | "REVIEW_REQUIRED";
export type ArtifactType = "note" | "lab" | "summary" | "report" | "imaging-summary";
export type DocumentContentType = "text/plain" | "text/markdown";
export type FhirTransportContentType = "application/fhir+json";
export type FhirImportResourceType = "Binary" | "DocumentReference";
export type FhirBundleType = "document" | "collection";
export type PhysicianPacketStatus = "DRAFT_REVIEW_REQUIRED" | "CLINICIAN_APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "FINALIZED";
export type ReviewAction = "approved" | "changes_requested" | "rejected";
export type AuditEventType =
  | "case.created"
  | "artifact.added"
  | "artifact.removed"
  | "document.ingested"
  | "fhir.imported"
  | "fhir.bundle.imported"
  | "packet.drafted"
  | "review.submitted"
  | "packet.finalized"
  | "case.deleted";
export type AuditEventOutcome = "success";

export interface CaseIntake {
  chiefConcern: string;
  symptomSummary: string;
  historySummary: string;
  questionsForClinician: string[];
}

export interface CreateCaseInput {
  patientLabel?: string;
  intake: CaseIntake;
}

export interface SourceArtifact {
  artifactId: string;
  artifactType: ArtifactType;
  title: string;
  summary: string;
  sourceDate?: string;
  provenance?: string;
  createdAt: string;
}

export interface AddArtifactInput {
  artifactType: ArtifactType;
  title: string;
  summary: string;
  sourceDate?: string;
  provenance?: string;
}

export interface IngestDocumentInput {
  artifactType: ArtifactType;
  title: string;
  contentType: DocumentContentType;
  content: string;
  filename?: string;
  sourceDate?: string;
  provenance?: string;
}

export interface DocumentIngestionResult {
  contentType: DocumentContentType;
  filename?: string;
  normalizedCharacterCount: number;
  excerptCharacterCount: number;
  truncated: boolean;
}

export interface FhirImportInput {
  artifactType?: ArtifactType;
  title?: string;
  sourceDate?: string;
  provenance?: string;
  resource: Record<string, unknown>;
}

export interface FhirBundleImportInput {
  artifactType?: ArtifactType;
  sourceDate?: string;
  provenance?: string;
  allowExternalAttachmentFetch?: boolean;
  resource: Record<string, unknown>;
}

export interface FhirImportResult {
  resourceType: FhirImportResourceType;
  transportContentType: FhirTransportContentType;
  sourceContentType: DocumentContentType;
  title: string;
  sourceDate?: string;
}

export interface FhirBundleImportResult {
  resourceType: "Bundle";
  bundleType: FhirBundleType;
  artifactCount: number;
  transportContentType: FhirTransportContentType;
  usedExternalAttachmentFetch: boolean;
}

export interface ExternalAttachmentFetchResult {
  contentType: string;
  content: string;
}

export type ExternalAttachmentFetcher = (url: string) => Promise<ExternalAttachmentFetchResult>;

export interface PhysicianPacketSection {
  label: string;
  content: string;
}

export interface PhysicianPacket {
  packetId: string;
  status: PhysicianPacketStatus;
  isStale: boolean;
  createdAt: string;
  staleAt?: string;
  requestedBy?: string;
  focus?: string;
  disclaimer: string;
  title: string;
  artifactIds: string[];
  sections: PhysicianPacketSection[];
  reviews: ClinicalReviewEntry[];
  finalizedAt?: string;
  finalizedBy?: string;
  finalizationReason?: string;
  finalizedFingerprint?: string;
}

export interface CreatePhysicianPacketInput {
  requestedBy?: string;
  focus?: string;
}

export interface FinalizePacketInput {
  finalizedBy: string;
  reason?: string;
}

export interface ClinicalReviewEntry {
  reviewId: string;
  reviewerName: string;
  action: ReviewAction;
  comments?: string;
  createdAt: string;
}

export interface SubmitReviewInput {
  reviewerName: string;
  action: ReviewAction;
  comments?: string;
}

export interface AuditEventRecord {
  auditId: string;
  caseId: string;
  packetId?: string;
  eventType: AuditEventType;
  action: string;
  occurredAt: string;
  recordedAt: string;
  actorId?: string;
  outcome: AuditEventOutcome;
  details?: Record<string, string | number | boolean | null>;
}

export interface AnamnesisCase {
  caseId: string;
  patientLabel?: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  intake: CaseIntake;
  artifacts: SourceArtifact[];
  physicianPackets: PhysicianPacket[];
}

export interface OperationsSummary {
  totalCases: number;
  totalArtifacts: number;
  totalPackets: number;
  totalReviews: number;
  totalFinalizedPackets: number;
  totalAuditEvents: number;
  statusCounts: Record<CaseStatus, number>;
  lastUpdatedAt: string | null;
}

export interface AnamnesisStore {
  listCases(): Promise<AnamnesisCase[]>;
  getCase(caseId: string): Promise<AnamnesisCase | undefined>;
  saveCase(nextCase: AnamnesisCase): Promise<void>;
  deleteCase(caseId: string): Promise<boolean>;
}

export interface AuditTrailStore {
  append(event: AuditEventRecord): Promise<void>;
  listByCase(caseId: string): Promise<AuditEventRecord[]>;
  countEvents(): Promise<number>;
}

export class AnamnesisDomainError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AnamnesisDomainError";
  }
}

const PACKET_DISCLAIMER =
  "This physician packet is a draft organizational summary for clinician review. It is not a diagnosis, treatment recommendation, or prescription.";
const DOCUMENT_EXCERPT_LIMIT = 4000;
const UTF8_TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

function toIso(now: Date): string {
  return now.toISOString();
}

function normalizeDocumentText(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildDocumentExcerpt(content: string): { excerpt: string; truncated: boolean } {
  if (content.length <= DOCUMENT_EXCERPT_LIMIT) {
    return {
      excerpt: content,
      truncated: false,
    };
  }

  const maxWithoutEllipsis = DOCUMENT_EXCERPT_LIMIT - 1;
  const candidate = content.slice(0, maxWithoutEllipsis).trimEnd();
  const lastBoundary = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
  const bounded = lastBoundary > Math.floor(candidate.length * 0.6)
    ? candidate.slice(0, lastBoundary).trimEnd()
    : candidate;

  return {
    excerpt: `${bounded}…`,
    truncated: true,
  };
}

function buildDocumentProvenance(input: IngestDocumentInput): string {
  const parts: string[] = [];
  if (input.provenance) {
    parts.push(input.provenance);
  }
  parts.push(`document-ingestion:${input.contentType}`);
  if (input.filename) {
    parts.push(`filename:${input.filename}`);
  }
  return parts.join("; ").slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseDocumentContentType(value: string | undefined): DocumentContentType | undefined {
  if (!value) {
    return undefined;
  }

  const baseContentType = value.split(";", 1)[0]?.trim().toLowerCase();
  return baseContentType === "text/plain" || baseContentType === "text/markdown"
    ? baseContentType
    : undefined;
}

function deriveSourceDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const candidate = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return undefined;
  }

  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(candidate)
    ? candidate
    : undefined;
}

function decodeBase64Utf8(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length === 0 || normalized.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(normalized)) {
    throw new AnamnesisDomainError(
      "fhir_import_invalid_base64",
      400,
      "FHIR import requires valid base64-encoded inline text data.",
    );
  }

  const decoded = Buffer.from(normalized, "base64");
  const roundTrip = decoded.toString("base64").replace(/=+$/u, "");
  if (roundTrip !== normalized.replace(/=+$/u, "")) {
    throw new AnamnesisDomainError(
      "fhir_import_invalid_base64",
      400,
      "FHIR import requires valid base64-encoded inline text data.",
    );
  }

  try {
    return UTF8_TEXT_DECODER.decode(decoded);
  } catch {
    throw new AnamnesisDomainError(
      "fhir_import_invalid_utf8",
      400,
      "FHIR import only accepts UTF-8 text attachments in this slice.",
    );
  }
}

function appendFhirProvenance(existing: string | undefined, resourceType: FhirImportResourceType): string {
  return existing ? `${existing}; fhir-import:${resourceType}` : `fhir-import:${resourceType}`;
}

function appendProvenance(existing: string | undefined, detail: string): string {
  return existing ? `${existing}; ${detail}` : detail;
}

interface ParsedFhirImport {
  artifactType: ArtifactType;
  title: string;
  sourceDate?: string;
  provenance?: string;
  resourceType: FhirImportResourceType;
  sourceContentType: DocumentContentType;
  textContent: string;
}

interface ParsedBundleImport {
  bundleType: FhirBundleType;
  entries: ParsedFhirImport[];
  usedExternalAttachmentFetch: boolean;
}

interface BundleDocumentReferenceAttachment {
  contentType?: DocumentContentType;
  url: string;
  title?: string;
  creation?: string;
}

function parseBinaryImport(input: FhirImportInput): ParsedFhirImport {
  const sourceContentType = parseDocumentContentType(readOptionalString(input.resource.contentType));
  if (!sourceContentType) {
    throw new AnamnesisDomainError(
      "fhir_import_content_type_unsupported",
      400,
      "FHIR Binary import only supports text/plain or text/markdown content in this slice.",
    );
  }

  const data = readOptionalString(input.resource.data);
  if (!data) {
    throw new AnamnesisDomainError(
      "fhir_import_requires_inline_data",
      400,
      "FHIR import requires inline attachment data. External dereference is out of scope.",
    );
  }

  return {
    artifactType: input.artifactType ?? "report",
    title: input.title ?? "FHIR Binary import",
    sourceDate: input.sourceDate,
    provenance: appendFhirProvenance(input.provenance, "Binary"),
    resourceType: "Binary",
    sourceContentType,
    textContent: decodeBase64Utf8(data),
  };
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
    sourceContentType: selectedContentType,
    textContent: decodeBase64Utf8(selectedData),
  };
}

function parseFhirImport(input: FhirImportInput): ParsedFhirImport {
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
    sourceContentType,
    textContent: fetchedAttachment.content,
  };
}

async function parseFhirBundle(
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
    entries: parsedEntries,
    usedExternalAttachmentFetch,
  };
}

function buildPacketFingerprint(record: AnamnesisCase, packet: PhysicianPacket): string {
  const snapshot = {
    caseId: record.caseId,
    packetId: packet.packetId,
    createdAt: packet.createdAt,
    requestedBy: packet.requestedBy ?? null,
    focus: packet.focus ?? null,
    disclaimer: packet.disclaimer,
    title: packet.title,
    artifactIds: [...packet.artifactIds],
    sections: packet.sections.map((section) => ({
      label: section.label,
      content: section.content,
    })),
    reviews: packet.reviews.map((review) => ({
      reviewId: review.reviewId,
      reviewerName: review.reviewerName,
      action: review.action,
      comments: review.comments ?? null,
      createdAt: review.createdAt,
    })),
  };

  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function createCase(input: CreateCaseInput, now = new Date()): AnamnesisCase {
  const timestamp = toIso(now);
  return {
    caseId: randomUUID(),
    patientLabel: input.patientLabel,
    status: "INTAKING",
    createdAt: timestamp,
    updatedAt: timestamp,
    intake: {
      chiefConcern: input.intake.chiefConcern,
      symptomSummary: input.intake.symptomSummary,
      historySummary: input.intake.historySummary,
      questionsForClinician: [...input.intake.questionsForClinician],
    },
    artifacts: [],
    physicianPackets: [],
  };
}

export function addArtifact(
  record: AnamnesisCase,
  input: AddArtifactInput,
  now = new Date(),
): AnamnesisCase {
  const updatedAt = toIso(now);
  const artifact: SourceArtifact = {
    artifactId: randomUUID(),
    artifactType: input.artifactType,
    title: input.title,
    summary: input.summary,
    sourceDate: input.sourceDate,
    provenance: input.provenance,
    createdAt: updatedAt,
  };

  const physicianPackets = record.physicianPackets.map((packet) =>
    packet.isStale
      ? packet
      : {
          ...packet,
          isStale: true,
          staleAt: updatedAt,
        },
  );

  return {
    ...record,
    status: record.status === "REVIEW_REQUIRED" ? record.status : "READY_FOR_PACKET",
    updatedAt,
    artifacts: [...record.artifacts, artifact],
    physicianPackets,
  };
}

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
      artifactCount: artifacts.length,
      transportContentType: "application/fhir+json",
      usedExternalAttachmentFetch: parsedBundle.usedExternalAttachmentFetch,
    },
  };
}

function buildPacketSections(
  record: AnamnesisCase,
  input: CreatePhysicianPacketInput,
): PhysicianPacketSection[] {
  const questions = record.intake.questionsForClinician.length
    ? record.intake.questionsForClinician.join("; ")
    : "No explicit clinician questions were provided in the current intake.";

  const artifactSummary = record.artifacts
    .map((artifact) => `${artifact.artifactType}: ${artifact.title}`)
    .join("; ");

  const sections: PhysicianPacketSection[] = [
    {
      label: "Chief concern",
      content: record.intake.chiefConcern,
    },
    {
      label: "Symptom summary",
      content: record.intake.symptomSummary,
    },
    {
      label: "History summary",
      content: record.intake.historySummary,
    },
    {
      label: "Questions for clinician",
      content: questions,
    },
    {
      label: "Registered evidence",
      content: artifactSummary,
    },
  ];

  if (input.focus) {
    sections.push({
      label: "Requested packet focus",
      content: input.focus,
    });
  }

  return sections;
}

export function draftPhysicianPacket(
  record: AnamnesisCase,
  input: CreatePhysicianPacketInput,
  now = new Date(),
): { nextCase: AnamnesisCase; packet: PhysicianPacket } {
  if (record.artifacts.length === 0) {
    throw new AnamnesisDomainError(
      "packet_requires_artifact",
      409,
      "At least one source artifact must be registered before a physician packet can be drafted.",
    );
  }

  const packet: PhysicianPacket = {
    packetId: randomUUID(),
    status: "DRAFT_REVIEW_REQUIRED",
    isStale: false,
    createdAt: toIso(now),
    requestedBy: input.requestedBy,
    focus: input.focus,
    disclaimer: PACKET_DISCLAIMER,
    title: `Physician packet draft for case ${record.caseId.slice(0, 8)}`,
    artifactIds: record.artifacts.map((artifact) => artifact.artifactId),
    sections: buildPacketSections(record, input),
    reviews: [],
  };

  return {
    packet,
    nextCase: {
      ...record,
      status: "REVIEW_REQUIRED",
      updatedAt: toIso(now),
      physicianPackets: [...record.physicianPackets, packet],
    },
  };
}

export function removeArtifact(
  record: AnamnesisCase,
  artifactId: string,
  now = new Date(),
): AnamnesisCase {
  const index = record.artifacts.findIndex((a) => a.artifactId === artifactId);
  if (index === -1) {
    throw new AnamnesisDomainError(
      "artifact_not_found",
      404,
      "Artifact not found.",
    );
  }

  const updatedAt = toIso(now);
  const artifacts = record.artifacts.filter((_, i) => i !== index);

  const physicianPackets = record.physicianPackets.map((packet) =>
    packet.isStale
      ? packet
      : {
          ...packet,
          isStale: true,
          staleAt: updatedAt,
        },
  );

  let status: CaseStatus = record.status;
  if (artifacts.length === 0 && status !== "REVIEW_REQUIRED") {
    status = "INTAKING";
  }

  return {
    ...record,
    status,
    updatedAt,
    artifacts,
    physicianPackets,
  };
}

export function buildOperationsSummary(
  cases: AnamnesisCase[],
  options?: { totalAuditEvents?: number },
): OperationsSummary {
  const statusCounts: Record<CaseStatus, number> = {
    INTAKING: 0,
    READY_FOR_PACKET: 0,
    REVIEW_REQUIRED: 0,
  };

  let totalArtifacts = 0;
  let totalPackets = 0;
  let totalReviews = 0;
  let totalFinalizedPackets = 0;
  let lastUpdatedAt: string | null = null;

  for (const record of cases) {
    statusCounts[record.status] += 1;
    totalArtifacts += record.artifacts.length;
    totalPackets += record.physicianPackets.length;
    for (const packet of record.physicianPackets) {
      totalReviews += packet.reviews.length;
      if (packet.status === "FINALIZED") {
        totalFinalizedPackets += 1;
      }
    }
    if (lastUpdatedAt === null || record.updatedAt > lastUpdatedAt) {
      lastUpdatedAt = record.updatedAt;
    }
  }

  return {
    totalCases: cases.length,
    totalArtifacts,
    totalPackets,
    totalReviews,
    totalFinalizedPackets,
    totalAuditEvents: options?.totalAuditEvents ?? 0,
    statusCounts,
    lastUpdatedAt,
  };
}

export function createAuditEvent(
  input: Omit<AuditEventRecord, "auditId" | "recordedAt" | "outcome"> & {
    outcome?: AuditEventOutcome;
  },
  now = new Date(),
): AuditEventRecord {
  return {
    auditId: randomUUID(),
    caseId: input.caseId,
    packetId: input.packetId,
    eventType: input.eventType,
    action: input.action,
    occurredAt: input.occurredAt,
    recordedAt: toIso(now),
    actorId: input.actorId,
    outcome: input.outcome ?? "success",
    details: input.details,
  };
}

const REVIEW_ACTION_TO_STATUS: Record<ReviewAction, PhysicianPacketStatus> = {
  approved: "CLINICIAN_APPROVED",
  changes_requested: "CHANGES_REQUESTED",
  rejected: "REJECTED",
};

export function submitReview(
  record: AnamnesisCase,
  packetId: string,
  input: SubmitReviewInput,
  now = new Date(),
): { nextCase: AnamnesisCase; review: ClinicalReviewEntry } {
  const packetIndex = record.physicianPackets.findIndex((p) => p.packetId === packetId);
  if (packetIndex === -1) {
    throw new AnamnesisDomainError(
      "packet_not_found",
      404,
      "Physician packet not found.",
    );
  }

  const packet = record.physicianPackets[packetIndex]!;

  if (packet.status === "CLINICIAN_APPROVED") {
    throw new AnamnesisDomainError(
      "packet_already_approved",
      409,
      "Cannot review a packet that has already been approved.",
    );
  }

  if (packet.status === "FINALIZED") {
    throw new AnamnesisDomainError(
      "packet_already_finalized",
      409,
      "Cannot review a packet that has already been finalized.",
    );
  }

  const review: ClinicalReviewEntry = {
    reviewId: randomUUID(),
    reviewerName: input.reviewerName,
    action: input.action,
    comments: input.comments,
    createdAt: toIso(now),
  };

  const updatedPacket: PhysicianPacket = {
    ...packet,
    status: REVIEW_ACTION_TO_STATUS[input.action],
    reviews: [...packet.reviews, review],
  };

  const updatedPackets = [...record.physicianPackets];
  updatedPackets[packetIndex] = updatedPacket;

  return {
    review,
    nextCase: {
      ...record,
      updatedAt: toIso(now),
      physicianPackets: updatedPackets,
    },
  };
}

export function finalizePhysicianPacket(
  record: AnamnesisCase,
  packetId: string,
  input: FinalizePacketInput,
  now = new Date(),
): { nextCase: AnamnesisCase; packet: PhysicianPacket } {
  const packetIndex = record.physicianPackets.findIndex((packet) => packet.packetId === packetId);
  if (packetIndex === -1) {
    throw new AnamnesisDomainError(
      "packet_not_found",
      404,
      "Physician packet not found.",
    );
  }

  const packet = record.physicianPackets[packetIndex]!;
  if (packet.status === "FINALIZED") {
    throw new AnamnesisDomainError(
      "packet_already_finalized",
      409,
      "Packet has already been finalized.",
    );
  }

  if (packet.isStale) {
    throw new AnamnesisDomainError(
      "packet_stale",
      409,
      "Packet must be regenerated before finalization because it is stale.",
    );
  }

  if (packet.status !== "CLINICIAN_APPROVED") {
    throw new AnamnesisDomainError(
      "packet_not_ready_for_finalization",
      409,
      "Only clinician-approved packets can be finalized.",
    );
  }

  const finalizedAt = toIso(now);
  const updatedPacket: PhysicianPacket = {
    ...packet,
    status: "FINALIZED",
    finalizedAt,
    finalizedBy: input.finalizedBy,
    finalizationReason: input.reason,
    finalizedFingerprint: buildPacketFingerprint(record, packet),
  };

  const updatedPackets = [...record.physicianPackets];
  updatedPackets[packetIndex] = updatedPacket;

  return {
    packet: updatedPacket,
    nextCase: {
      ...record,
      updatedAt: finalizedAt,
      physicianPackets: updatedPackets,
    },
  };
}
