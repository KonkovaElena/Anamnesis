import Database from "better-sqlite3";
import type { ChainedAuditEventRecord, PaginationOptions } from "../domain/anamnesis";
import { clampPagination } from "../domain/anamnesis/store-contracts";
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
  options?: PaginationOptions,
): ChainedAuditEventRecord[] {
  const { limit, offset } = clampPagination(options);
  const rows = db
    .prepare(
      `SELECT ${AUDIT_EVENT_SELECT_FIELDS}
       FROM audit_events
       WHERE ${field} = ?
       ORDER BY sequence ASC
       LIMIT ? OFFSET ?`
    )
    .all(value, limit, offset) as SqliteAuditEventRow[];

  return rows.map(mapSqliteAuditEventRow);
}