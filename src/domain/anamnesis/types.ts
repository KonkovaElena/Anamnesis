export type CaseStatus = "INTAKING" | "READY_FOR_PACKET" | "REVIEW_REQUIRED";
export type ArtifactType = "note" | "lab" | "summary" | "report" | "imaging-summary";
export type DocumentContentType = "text/plain" | "text/markdown";
export type FhirTransportContentType = "application/fhir+json";
export type FhirImportResourceType = "Binary" | "DocumentReference";
export type FhirBundleType = "document" | "collection";
export type PhysicianPacketStatus = "DRAFT_REVIEW_REQUIRED" | "CLINICIAN_APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "FINALIZED";
export type ReviewAction = "approved" | "changes_requested" | "rejected";
export type WorkflowFamily = "GENERAL_INTAKE" | "MRI_SECOND_OPINION" | "MRNA_BOARD_REVIEW";
export type ArtifactClass = "SOURCE" | "DERIVED" | "REVIEW_PACKET" | "HANDOFF_PACKET";
export type SourceArtifactSemanticType =
  | "clinical-note"
  | "lab-panel"
  | "clinical-summary"
  | "imaging-study"
  | "imaging-qc-summary"
  | "tumor-dna-fastq"
  | "normal-dna-fastq"
  | "tumor-rna-fastq"
  | "board-evidence-bundle";
export type AuthMechanism = "anonymous" | "api-key" | "jwt-bearer";
export type SampleType = "TUMOR_DNA" | "NORMAL_DNA" | "TUMOR_RNA" | "FOLLOW_UP";
export type AssayType = "WES" | "WGS" | "RNA_SEQ" | "PANEL" | "OTHER";
export type QcCheckStatus = "pass" | "warn" | "reject";

export type { AuditEventOutcome, AuditEventRecord, AuditEventType, CreateAuditEventInput } from "../../core/audit-events";
