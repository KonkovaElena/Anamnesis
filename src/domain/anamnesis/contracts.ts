import type { AuditEventRecord } from "../../core/audit-events";

export type CaseStatus = "INTAKING" | "READY_FOR_PACKET" | "REVIEW_REQUIRED";
export type ArtifactType = "note" | "lab" | "summary" | "report" | "imaging-summary";
export type DocumentContentType = "text/plain" | "text/markdown";
export type FhirTransportContentType = "application/fhir+json";
export type FhirImportResourceType = "Binary" | "DocumentReference";
export type FhirBundleType = "document" | "collection";
export type PhysicianPacketStatus = "DRAFT_REVIEW_REQUIRED" | "CLINICIAN_APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "FINALIZED";
export type ReviewAction = "approved" | "changes_requested" | "rejected";

export type { AuditEventOutcome, AuditEventRecord, AuditEventType, CreateAuditEventInput } from "../../core/audit-events";

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
  normalizationProfile: string;
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
  importProfile: string;
  title: string;
  sourceDate?: string;
}

export interface FhirBundleImportResult {
  resourceType: "Bundle";
  bundleType: FhirBundleType;
  bundleProfile: string;
  entryProfiles: string[];
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
  listByCorrelationId(correlationId: string): Promise<AuditEventRecord[]>;
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