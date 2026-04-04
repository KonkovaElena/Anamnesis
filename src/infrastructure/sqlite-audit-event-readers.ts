import Database from "better-sqlite3";
import type { AuditEventRecord } from "../domain/anamnesis";
import {
  AUDIT_EVENT_SELECT_FIELDS,
  mapSqliteAuditEventRow,
  type SqliteAuditEventRow,
} from "./sqlite-audit-event-rows";

export type AuditEventLookupField = "case_id" | "correlation_id";

export function listSqliteAuditEventsByField(
  db: Database.Database,
  field: AuditEventLookupField,
  value: string,
): AuditEventRecord[] {
  const rows = db
    .prepare(
      `SELECT ${AUDIT_EVENT_SELECT_FIELDS}
       FROM audit_events
       WHERE ${field} = ?
       ORDER BY sequence ASC`
    )
    .all(value) as SqliteAuditEventRow[];

  return rows.map(mapSqliteAuditEventRow);
}