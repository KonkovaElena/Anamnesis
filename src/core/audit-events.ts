import { z } from "zod";
import { normalizeCorrelationId } from "./correlation";
import { IdGenerator } from "./ids";

export const AuditEventTypeSchema = z.enum([
  "case.created",
  "artifact.added",
  "artifact.removed",
  "document.ingested",
  "fhir.imported",
  "fhir.bundle.imported",
  "packet.drafted",
  "review.submitted",
  "packet.finalized",
  "case.deleted",
]);

export const AuditEventOutcomeSchema = z.enum(["success"]);
export const AUDIT_EVENT_SCHEMA_VERSION = 1 as const;

const AuditEventDetailValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const AuditEventDetailsSchema = z.record(z.string(), AuditEventDetailValueSchema);

export const AuditEventRecordSchema = z.object({
  auditId: z.string().uuid(),
  eventId: z.string().uuid(),
  caseId: z.string().min(1),
  packetId: z.string().min(1).optional(),
  eventType: AuditEventTypeSchema,
  action: z.string().min(1),
  occurredAt: z.string().min(1),
  recordedAt: z.string().min(1),
  actorId: z.string().min(1).optional(),
  outcome: AuditEventOutcomeSchema,
  details: AuditEventDetailsSchema.optional(),
  correlationId: z.string().min(1),
  causationId: z.string().min(1).optional(),
  schemaVersion: z.literal(AUDIT_EVENT_SCHEMA_VERSION),
}).superRefine((event, context) => {
  if (event.eventId !== event.auditId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["eventId"],
      message: "eventId must mirror auditId",
    });
  }
});

export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;
export type AuditEventOutcome = z.infer<typeof AuditEventOutcomeSchema>;
export type AuditEventRecord = z.infer<typeof AuditEventRecordSchema>;

export interface CreateAuditEventInput {
  caseId: string;
  packetId?: string;
  eventType: AuditEventType;
  action: string;
  occurredAt: string;
  actorId?: string;
  outcome?: AuditEventOutcome;
  details?: AuditEventRecord["details"];
  correlationId?: string;
  causationId?: string;
}

export function validateAuditEventRecord(input: unknown): AuditEventRecord {
  return AuditEventRecordSchema.parse(input);
}

export function createTypedAuditEvent(
  input: CreateAuditEventInput,
  now = new Date(),
): AuditEventRecord {
  const eventId = IdGenerator.generate();

  return validateAuditEventRecord({
    auditId: eventId,
    eventId,
    caseId: input.caseId,
    packetId: input.packetId,
    eventType: input.eventType,
    action: input.action,
    occurredAt: input.occurredAt,
    recordedAt: now.toISOString(),
    actorId: input.actorId,
    outcome: input.outcome ?? "success",
    details: input.details,
    correlationId: normalizeCorrelationId(input.correlationId),
    causationId: input.causationId,
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
  });
}