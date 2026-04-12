import { randomUUID } from "node:crypto";
import {
  type AddArtifactInput,
  type AnamnesisCase,
  AnamnesisDomainError,
  type AttachStudyContextInput,
  type CaseStatus,
  type CreateCaseInput,
  type PhysicianPacket,
  type RegisterSampleInput,
  type SourceArtifact,
} from "./contracts";
import {
  createPendingQcSummary,
  createQcSummaryRecord,
  createStudyContextRecord,
} from "./specialty-context";
import { createOwnerScopedAccessControl, grantCasePrincipalAccess } from "./access-control";

function toIso(now: Date): string {
  return now.toISOString();
}

function markPacketsStale(
  packets: PhysicianPacket[],
  staleAt: string,
): PhysicianPacket[] {
  return packets.map((packet) =>
    packet.isStale
      ? packet
      : {
          ...packet,
          isStale: true,
          staleAt,
        },
  );
}

export function createCase(
  input: CreateCaseInput,
  now = new Date(),
  options?: { ownerPrincipalId?: string },
): AnamnesisCase {
  const timestamp = toIso(now);
  return {
    caseId: randomUUID(),
    patientLabel: input.patientLabel,
    accessControl: options?.ownerPrincipalId
      ? createOwnerScopedAccessControl(options.ownerPrincipalId)
      : undefined,
    workflowFamily: input.workflowFamily ?? "GENERAL_INTAKE",
    status: "INTAKING",
    createdAt: timestamp,
    updatedAt: timestamp,
    intake: {
      chiefConcern: input.intake.chiefConcern,
      symptomSummary: input.intake.symptomSummary,
      historySummary: input.intake.historySummary,
      questionsForClinician: [...input.intake.questionsForClinician],
    },
    samples: [],
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
    artifactClass: input.artifactClass,
    semanticType: input.semanticType,
    sampleId: input.sampleId,
    artifactHash: input.artifactHash,
    storageUri: input.storageUri,
    mediaType: input.mediaType,
    derivedFromArtifactIds: input.derivedFromArtifactIds ? [...input.derivedFromArtifactIds] : undefined,
    title: input.title,
    summary: input.summary,
    sourceDate: input.sourceDate,
    provenance: input.provenance,
    createdAt: updatedAt,
  };

  return {
    ...record,
    status: record.status === "REVIEW_REQUIRED" ? record.status : "READY_FOR_PACKET",
    updatedAt,
    artifacts: [...record.artifacts, artifact],
    physicianPackets: markPacketsStale(record.physicianPackets, updatedAt),
  };
}

export function removeArtifact(
  record: AnamnesisCase,
  artifactId: string,
  now = new Date(),
): AnamnesisCase {
  const index = record.artifacts.findIndex((artifact) => artifact.artifactId === artifactId);
  if (index === -1) {
    throw new AnamnesisDomainError(
      "artifact_not_found",
      404,
      "Artifact not found.",
    );
  }

  const updatedAt = toIso(now);
  const artifacts = record.artifacts.filter((_, artifactIndex) => artifactIndex !== index);

  let status: CaseStatus = record.status;
  if (artifacts.length === 0 && status !== "REVIEW_REQUIRED") {
    status = "INTAKING";
  }

  return {
    ...record,
    status,
    updatedAt,
    artifacts,
    physicianPackets: markPacketsStale(record.physicianPackets, updatedAt),
  };
}

export function grantCaseAccess(
  record: AnamnesisCase,
  principalId: string,
  now = new Date(),
): AnamnesisCase {
  if (!record.accessControl) {
    throw new AnamnesisDomainError(
      "case_access_control_unavailable",
      409,
      "Case access cannot be granted for this case.",
    );
  }

  const nextAccessControl = grantCasePrincipalAccess(record.accessControl, principalId);
  if (nextAccessControl === record.accessControl) {
    return record;
  }

  return {
    ...record,
    accessControl: nextAccessControl,
    updatedAt: toIso(now),
  };
}

export function registerSample(
  record: AnamnesisCase,
  input: RegisterSampleInput,
  now = new Date(),
): AnamnesisCase {
  if (record.samples.some((sample) => sample.sampleId === input.sampleId)) {
    throw new AnamnesisDomainError(
      "sample_already_registered",
      409,
      "Sample is already registered for this case.",
    );
  }

  const updatedAt = toIso(now);

  return {
    ...record,
    updatedAt,
    samples: [
      ...record.samples,
      {
        sampleId: input.sampleId,
        sampleType: input.sampleType,
        assayType: input.assayType,
        accessionId: input.accessionId,
        sourceSite: input.sourceSite,
        registeredAt: updatedAt,
      },
    ],
  };
}

export function attachStudyContext(
  record: AnamnesisCase,
  input: AttachStudyContextInput,
  now = new Date(),
): AnamnesisCase {
  const updatedAt = toIso(now);

  return {
    ...record,
    updatedAt,
    studyContext: createStudyContextRecord({
      fallbackStudyUid: record.caseId,
      receivedAt: updatedAt,
      source: input.source,
      studyContext: input.studyContext,
    }),
    qcSummary: record.qcSummary ?? createPendingQcSummary(),
  };
}

export function recordQcSummary(
  record: AnamnesisCase,
  input: { disposition: "pass" | "warn" | "reject"; issues?: string[]; qcSummary?: { summary?: string; checks?: Array<{ checkId: string; status: "pass" | "warn" | "reject"; detail: string }>; metrics?: Array<{ name: string; value: number; unit?: string }> } },
  now = new Date(),
): AnamnesisCase {
  if (!record.studyContext) {
    throw new AnamnesisDomainError(
      "study_context_required",
      409,
      "A study context must be attached before a QC summary can be recorded.",
    );
  }

  const checkedAt = toIso(now);

  return {
    ...record,
    updatedAt: checkedAt,
    qcSummary: createQcSummaryRecord({
      disposition: input.disposition,
      issues: input.issues,
      qcSummary: input.qcSummary,
      checkedAt,
    }),
  };
}