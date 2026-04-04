import { AUDIT_EVENT_SCHEMA_VERSION, validateAuditEventRecord } from "../core/audit-events";
import type { AuditEventRecord } from "../domain/anamnesis";

export const AUDIT_EVENT_SELECT_FIELDS = `audit_id, event_id, schema_version, case_id, packet_id, event_type, action, occurred_at, recorded_at, actor_id, outcome, correlation_id, causation_id, details_json`;

export interface SqliteAuditEventRow {
  audit_id: string;
  event_id: string | null;
  schema_version: number | null;
  case_id: string;
  packet_id: string | null;
  event_type: AuditEventRecord["eventType"];
  action: string;
  occurred_at: string;
  recorded_at: string;
  actor_id: string | null;
  outcome: AuditEventRecord["outcome"];
  correlation_id: string | null;
  causation_id: string | null;
  details_json: string;
}

export function mapSqliteAuditEventRow(row: SqliteAuditEventRow): AuditEventRecord {
  return validateAuditEventRecord({
    auditId: row.audit_id,
    eventId: row.event_id ?? row.audit_id,
    caseId: row.case_id,
    packetId: row.packet_id ?? undefined,
    eventType: row.event_type,
    action: row.action,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    actorId: row.actor_id ?? undefined,
    outcome: row.outcome,
    details: JSON.parse(row.details_json) as AuditEventRecord["details"],
    correlationId: row.correlation_id ?? `legacy_${row.audit_id}`,
    causationId: row.causation_id ?? undefined,
    schemaVersion: row.schema_version ?? AUDIT_EVENT_SCHEMA_VERSION,
  });
}