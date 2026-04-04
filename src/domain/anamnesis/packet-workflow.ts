import { createHash, randomUUID } from "node:crypto";
import {
  type AnamnesisCase,
  AnamnesisDomainError,
  type ClinicalReviewEntry,
  type CreatePhysicianPacketInput,
  type FinalizePacketInput,
  type PhysicianPacket,
  type PhysicianPacketSection,
  type SubmitReviewInput,
} from "./contracts";
import {
  assertPacketCanAcceptReview,
  assertPacketCanBeFinalized,
  resolvePacketStatusFromReviewAction,
} from "./packet-state-machine";

const PACKET_DISCLAIMER =
  "This physician packet is a draft organizational summary for clinician review. It is not a diagnosis, treatment recommendation, or prescription.";

function toIso(now: Date): string {
  return now.toISOString();
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

export function submitReview(
  record: AnamnesisCase,
  packetId: string,
  input: SubmitReviewInput,
  now = new Date(),
): { nextCase: AnamnesisCase; review: ClinicalReviewEntry } {
  const packetIndex = record.physicianPackets.findIndex((packet) => packet.packetId === packetId);
  if (packetIndex === -1) {
    throw new AnamnesisDomainError(
      "packet_not_found",
      404,
      "Physician packet not found.",
    );
  }

  const packet = record.physicianPackets[packetIndex]!;
  assertPacketCanAcceptReview(packet);

  const review: ClinicalReviewEntry = {
    reviewId: randomUUID(),
    reviewerName: input.reviewerName,
    action: input.action,
    comments: input.comments,
    createdAt: toIso(now),
  };

  const updatedPacket: PhysicianPacket = {
    ...packet,
    status: resolvePacketStatusFromReviewAction(input.action),
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
  assertPacketCanBeFinalized(packet);

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