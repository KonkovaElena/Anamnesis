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
import { buildArtifactEvidenceLineage } from "./evidence-lineage";

const PACKET_DISCLAIMER =
  "This physician packet is a draft organizational summary for clinician review. It is not a diagnosis, treatment recommendation, or prescription.";

function formatWorkflowFamily(record: AnamnesisCase): string | undefined {
  switch (record.workflowFamily) {
    case "MRI_SECOND_OPINION":
      return "MRI second opinion";
    case "MRNA_BOARD_REVIEW":
      return "mRNA board review";
    default:
      return undefined;
  }
}

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
    .map((artifact) => {
      const extractedDescriptor = [artifact.artifactClass, artifact.semanticType].filter(Boolean).join("/");
      return extractedDescriptor.length > 0
        ? `${extractedDescriptor}: ${artifact.title}`
        : `${artifact.artifactType}: ${artifact.title}`;
    })
    .join("; ");

  const workflowFamily = formatWorkflowFamily(record);

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

  if (workflowFamily) {
    sections.push({
      label: "Workflow family",
      content: workflowFamily,
    });
  }

  if (record.samples.length > 0) {
    sections.push({
      label: "Registered samples",
      content: record.samples
        .map((sample) => `${sample.sampleType} (${sample.assayType}) accession ${sample.accessionId} from ${sample.sourceSite}`)
        .join("; "),
    });
  }

  if (record.studyContext) {
    const studyParts = [
      `Study UID: ${record.studyContext.studyInstanceUid}`,
      record.studyContext.accessionNumber ? `Accession: ${record.studyContext.accessionNumber}` : undefined,
      record.studyContext.studyDate ? `Date: ${record.studyContext.studyDate}` : undefined,
      record.studyContext.sourceArchive ? `Archive: ${record.studyContext.sourceArchive}` : undefined,
      `${record.studyContext.series.length} series registered`,
    ].filter((value): value is string => Boolean(value));

    sections.push({
      label: "Imaging study context",
      content: studyParts.join("; "),
    });
  }

  if (record.qcSummary && record.qcSummary.disposition !== "pending") {
    const qcParts = [
      `Disposition: ${record.qcSummary.disposition}`,
      record.qcSummary.summary ? `Summary: ${record.qcSummary.summary}` : undefined,
      record.qcSummary.checks.length > 0
        ? `Checks: ${record.qcSummary.checks.map((check) => `${check.checkId}=${check.status}`).join(", ")}`
        : undefined,
      record.qcSummary.issues.length > 0 ? `Issues: ${record.qcSummary.issues.join(", ")}` : "No blocking issues recorded.",
    ].filter((value): value is string => Boolean(value));

    sections.push({
      label: "Quality control summary",
      content: qcParts.join("; "),
    });
  }

  const evidenceLineage = buildArtifactEvidenceLineage(record.artifacts);
  if (evidenceLineage.edges.length > 0) {
    const titleByArtifactId = new Map(record.artifacts.map((artifact) => [artifact.artifactId, artifact.title]));
    const rootTitles = evidenceLineage.roots.map((artifactId) => titleByArtifactId.get(artifactId) ?? artifactId);
    const terminalTitles = evidenceLineage.terminal.map((artifactId) => titleByArtifactId.get(artifactId) ?? artifactId);

    sections.push({
      label: "Evidence lineage",
      content: `Links: ${evidenceLineage.edges.length}; roots: ${rootTitles.join(", ")}; terminal: ${terminalTitles.join(", ")}`,
    });
  }

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