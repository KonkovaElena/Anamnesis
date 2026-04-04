import { createTypedAuditEvent } from "../../core/audit-events";
import {
  type AnamnesisCase,
  type CaseStatus,
  type CreateAuditEventInput,
  type OperationsSummary,
} from "./contracts";

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
  input: CreateAuditEventInput,
  now = new Date(),
) {
  return createTypedAuditEvent(input, now);
}