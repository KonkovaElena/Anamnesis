import type {
  ArtifactClass,
  ArtifactType,
  AssayType,
  AuthMechanism,
  CaseStatus,
  DocumentContentType,
  FhirBundleType,
  FhirImportResourceType,
  FhirTransportContentType,
  PhysicianPacketStatus,
  QcCheckStatus,
  ReviewAction,
  SampleType,
  SourceArtifactSemanticType,
  WorkflowFamily,
} from "./types";

export interface CaseIntake {
  chiefConcern: string;
  symptomSummary: string;
  historySummary: string;
  questionsForClinician: string[];
}

export interface CreateCaseInput {
  patientLabel?: string;
  workflowFamily?: WorkflowFamily;
  intake: CaseIntake;
}

export interface SourceArtifact {
  artifactId: string;
  artifactType: ArtifactType;
  artifactClass?: ArtifactClass;
  semanticType?: SourceArtifactSemanticType;
  sampleId?: string;
  artifactHash?: string;
  storageUri?: string;
  mediaType?: string;
  derivedFromArtifactIds?: string[];
  title: string;
  summary: string;
  sourceDate?: string;
  provenance?: string;
  createdAt: string;
}

export interface AddArtifactInput {
  artifactType: ArtifactType;
  artifactClass?: ArtifactClass;
  semanticType?: SourceArtifactSemanticType;
  sampleId?: string;
  artifactHash?: string;
  storageUri?: string;
  mediaType?: string;
  derivedFromArtifactIds?: string[];
  title: string;
  summary: string;
  sourceDate?: string;
  provenance?: string;
}

export interface SampleRecord {
  sampleId: string;
  sampleType: SampleType;
  assayType: AssayType;
  accessionId: string;
  sourceSite: string;
  registeredAt: string;
}

export interface RegisterSampleInput {
  sampleId: string;
  sampleType: SampleType;
  assayType: AssayType;
  accessionId: string;
  sourceSite: string;
}

export interface StudySeriesInput {
  seriesInstanceUid: string;
  seriesDescription?: string;
  modality?: string;
  sequenceLabel?: string;
  instanceCount?: number;
  volumeDownloadUrl?: string;
}

export interface StudyContextInput {
  studyInstanceUid?: string;
  accessionNumber?: string;
  studyDate?: string;
  sourceArchive?: string;
  dicomWebBaseUrl?: string;
  metadataSummary?: string[];
  series?: StudySeriesInput[];
}

export interface AttachStudyContextInput {
  source: "public-api" | "internal-ingest";
  studyContext?: StudyContextInput;
}

export interface StudySeriesRecord {
  seriesInstanceUid: string;
  seriesDescription: string | null;
  modality: string;
  sequenceLabel: string | null;
  instanceCount: number | null;
  volumeDownloadUrl: string | null;
}

export interface StudyContextRecord {
  studyInstanceUid: string;
  dicomStudyInstanceUid: string;
  accessionNumber: string | null;
  studyDate: string | null;
  sourceArchive: string | null;
  dicomWebBaseUrl: string | null;
  metadataSummary: string[];
  series: StudySeriesRecord[];
  receivedAt: string;
  source: "public-api" | "internal-ingest";
}

export interface QcMetricInput {
  name: string;
  value: number;
  unit?: string;
}

export interface QcCheckInput {
  checkId: string;
  status: QcCheckStatus;
  detail: string;
}

export interface QcSummaryInput {
  summary?: string;
  checks?: QcCheckInput[];
  metrics?: QcMetricInput[];
}

export interface RecordQcSummaryInput {
  disposition: QcCheckStatus;
  issues?: string[];
  qcSummary?: QcSummaryInput;
}

export interface QcMetricRecord {
  name: string;
  value: number;
  unit: string | null;
}

export interface QcCheckRecord {
  checkId: string;
  status: QcCheckStatus;
  detail: string;
}

export interface QcSummaryRecord {
  disposition: QcCheckStatus | "pending";
  summary: string | null;
  checkedAt: string | null;
  source: "pending" | "internal-inference";
  checks: QcCheckRecord[];
  metrics: QcMetricRecord[];
  issues: string[];
}

export interface EvidenceLineageEdge {
  producerArtifactId: string;
  consumerArtifactId: string;
}

export interface EvidenceLineageGraph {
  edges: EvidenceLineageEdge[];
  roots: string[];
  terminal: string[];
}

export interface AuditContext {
  correlationId: string;
  actorId: string;
  authMechanism: AuthMechanism;
}

export interface RequestPrincipal {
  principalId: string;
  actorId: string;
  authMechanism: AuthMechanism;
  roles: string[];
  claims?: Record<string, unknown>;
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

export interface CaseAccessControl {
  ownerPrincipalId: string;
  allowedPrincipalIds: string[];
}

export interface AnamnesisCase {
  caseId: string;
  patientLabel?: string;
  accessControl?: CaseAccessControl;
  workflowFamily: WorkflowFamily;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  intake: CaseIntake;
  samples: SampleRecord[];
  studyContext?: StudyContextRecord;
  qcSummary?: QcSummaryRecord;
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

// ---------------------------------------------------------------------------
// LLM Sidecar Port (Phase 3: Retrieval-backed packet enrichment)
// ---------------------------------------------------------------------------

export interface LlmDraftAssistanceInput {
  caseId: string;
  artifacts: ReadonlyArray<Pick<SourceArtifact, "artifactId" | "artifactType" | "title" | "summary">>;
  intake: CaseIntake;
  focus?: string;
  maxTokens?: number;
}

export interface LlmDraftAssistanceResult {
  sections: PhysicianPacketSection[];
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  disclaimer: string;
}

export interface LlmSidecar {
  isAvailable(): Promise<boolean>;
  assistDraft(input: LlmDraftAssistanceInput): Promise<LlmDraftAssistanceResult>;
}
