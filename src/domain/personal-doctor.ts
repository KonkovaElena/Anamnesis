import { createHash, randomUUID } from "node:crypto";

export type CaseStatus = "INTAKING" | "READY_FOR_PACKET" | "REVIEW_REQUIRED";
export type ArtifactType = "note" | "lab" | "summary" | "report" | "imaging-summary";
export type PhysicianPacketStatus = "DRAFT_REVIEW_REQUIRED" | "CLINICIAN_APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "FINALIZED";
export type ReviewAction = "approved" | "changes_requested" | "rejected";
export type AuditEventType =
  | "case.created"
  | "artifact.added"
  | "artifact.removed"
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

export interface PersonalDoctorCase {
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

export interface PersonalDoctorStore {
  listCases(): Promise<PersonalDoctorCase[]>;
  getCase(caseId: string): Promise<PersonalDoctorCase | undefined>;
  saveCase(nextCase: PersonalDoctorCase): Promise<void>;
  deleteCase(caseId: string): Promise<boolean>;
}

export interface AuditTrailStore {
  append(event: AuditEventRecord): Promise<void>;
  listByCase(caseId: string): Promise<AuditEventRecord[]>;
  countEvents(): Promise<number>;
}

export class PersonalDoctorDomainError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PersonalDoctorDomainError";
  }
}

const PACKET_DISCLAIMER =
  "This physician packet is a draft organizational summary for clinician review. It is not a diagnosis, treatment recommendation, or prescription.";

function toIso(now: Date): string {
  return now.toISOString();
}

function buildPacketFingerprint(record: PersonalDoctorCase, packet: PhysicianPacket): string {
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

export function createCase(input: CreateCaseInput, now = new Date()): PersonalDoctorCase {
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
  record: PersonalDoctorCase,
  input: AddArtifactInput,
  now = new Date(),
): PersonalDoctorCase {
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

function buildPacketSections(
  record: PersonalDoctorCase,
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
  record: PersonalDoctorCase,
  input: CreatePhysicianPacketInput,
  now = new Date(),
): { nextCase: PersonalDoctorCase; packet: PhysicianPacket } {
  if (record.artifacts.length === 0) {
    throw new PersonalDoctorDomainError(
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
  record: PersonalDoctorCase,
  artifactId: string,
  now = new Date(),
): PersonalDoctorCase {
  const index = record.artifacts.findIndex((a) => a.artifactId === artifactId);
  if (index === -1) {
    throw new PersonalDoctorDomainError(
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
  cases: PersonalDoctorCase[],
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
  record: PersonalDoctorCase,
  packetId: string,
  input: SubmitReviewInput,
  now = new Date(),
): { nextCase: PersonalDoctorCase; review: ClinicalReviewEntry } {
  const packetIndex = record.physicianPackets.findIndex((p) => p.packetId === packetId);
  if (packetIndex === -1) {
    throw new PersonalDoctorDomainError(
      "packet_not_found",
      404,
      "Physician packet not found.",
    );
  }

  const packet = record.physicianPackets[packetIndex]!;

  if (packet.status === "CLINICIAN_APPROVED") {
    throw new PersonalDoctorDomainError(
      "packet_already_approved",
      409,
      "Cannot review a packet that has already been approved.",
    );
  }

  if (packet.status === "FINALIZED") {
    throw new PersonalDoctorDomainError(
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
  record: PersonalDoctorCase,
  packetId: string,
  input: FinalizePacketInput,
  now = new Date(),
): { nextCase: PersonalDoctorCase; packet: PhysicianPacket } {
  const packetIndex = record.physicianPackets.findIndex((packet) => packet.packetId === packetId);
  if (packetIndex === -1) {
    throw new PersonalDoctorDomainError(
      "packet_not_found",
      404,
      "Physician packet not found.",
    );
  }

  const packet = record.physicianPackets[packetIndex]!;
  if (packet.status === "FINALIZED") {
    throw new PersonalDoctorDomainError(
      "packet_already_finalized",
      409,
      "Packet has already been finalized.",
    );
  }

  if (packet.isStale) {
    throw new PersonalDoctorDomainError(
      "packet_stale",
      409,
      "Packet must be regenerated before finalization because it is stale.",
    );
  }

  if (packet.status !== "CLINICIAN_APPROVED") {
    throw new PersonalDoctorDomainError(
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
