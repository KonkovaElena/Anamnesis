import { randomUUID } from "node:crypto";
import {
  type AddArtifactInput,
  type AnamnesisCase,
  AnamnesisDomainError,
  type CaseStatus,
  type CreateCaseInput,
  type PhysicianPacket,
  type SourceArtifact,
} from "./contracts";

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