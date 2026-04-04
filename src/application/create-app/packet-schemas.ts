import { z } from "zod";

export const createPacketSchema = z.strictObject({
  requestedBy: z.string().trim().min(1).max(120).optional(),
  focus: z.string().trim().min(1).max(300).optional(),
});

export const submitReviewSchema = z.strictObject({
  reviewerName: z.string().trim().min(1).max(120),
  action: z.enum(["approved", "changes_requested", "rejected"]),
  comments: z.string().trim().min(1).max(4000).optional(),
});

export const finalizePacketSchema = z.strictObject({
  finalizedBy: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(4000).optional(),
});