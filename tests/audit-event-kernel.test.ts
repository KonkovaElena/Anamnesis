import assert from "node:assert/strict";
import test from "node:test";
import { createAuditEvent } from "../src/domain/anamnesis";
import { validateAuditEventRecord } from "../src/core/audit-events";

test("createAuditEvent produces a typed audit event with extracted event metadata", () => {
  const occurredAt = "2026-04-03T12:00:00.000Z";
  const event = createAuditEvent(
    {
      caseId: "case-123",
      eventType: "case.created",
      action: "create_case",
      occurredAt,
      details: {
        hasPatientLabel: true,
      },
    },
    new Date("2026-04-03T12:01:00.000Z"),
  );

  assert.equal(event.caseId, "case-123");
  assert.equal(event.eventType, "case.created");
  assert.equal(event.auditId, event.eventId);
  assert.equal(event.schemaVersion, 1);
  assert.match(event.correlationId, /^corr_[A-Za-z0-9_-]+/);
  assert.equal(event.occurredAt, occurredAt);
  assert.equal(event.recordedAt, "2026-04-03T12:01:00.000Z");
  assert.deepStrictEqual(validateAuditEventRecord(event), event);
});

test("createAuditEvent preserves supplied correlation and causation ids", () => {
  const event = createAuditEvent(
    {
      caseId: "case-456",
      packetId: "packet-1",
      eventType: "packet.finalized",
      action: "finalize_packet",
      occurredAt: "2026-04-03T12:05:00.000Z",
      correlationId: "req_12345",
      causationId: "event-ancestor-1",
      actorId: "Dr. Ada",
    },
    new Date("2026-04-03T12:06:00.000Z"),
  );

  assert.equal(event.correlationId, "req_12345");
  assert.equal(event.causationId, "event-ancestor-1");
  assert.equal(event.packetId, "packet-1");
  assert.equal(event.actorId, "Dr. Ada");
  assert.deepStrictEqual(validateAuditEventRecord(event), event);
});