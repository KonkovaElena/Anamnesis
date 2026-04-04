import {
  AnamnesisDomainError,
  type PhysicianPacket,
  type PhysicianPacketStatus,
  type ReviewAction,
} from "./contracts";

const REVIEW_ACTION_TO_STATUS: Record<ReviewAction, PhysicianPacketStatus> = {
  approved: "CLINICIAN_APPROVED",
  changes_requested: "CHANGES_REQUESTED",
  rejected: "REJECTED",
};

export function resolvePacketStatusFromReviewAction(action: ReviewAction): PhysicianPacketStatus {
  return REVIEW_ACTION_TO_STATUS[action];
}

export function assertPacketCanAcceptReview(packet: PhysicianPacket): void {
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
}

export function assertPacketCanBeFinalized(packet: PhysicianPacket): void {
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
}