import Database from "better-sqlite3";
import { validateAuditEventRecord } from "../core/audit-events";
import type { AuditEventRecord, AuditTrailStore, PaginationOptions } from "../domain/anamnesis";
import {
  listSqliteAuditEventsByField,
} from "./sqlite-audit-event-readers";

export interface SqliteAuditTrailStoreOptions {
  dbPath: string;
}

export class SqliteAuditTrailStore implements AuditTrailStore {
  private readonly db: Database.Database;

  constructor(options: SqliteAuditTrailStoreOptions) {
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        sequence     INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id     TEXT NOT NULL UNIQUE,
        event_id     TEXT,
        schema_version INTEGER,
        case_id      TEXT NOT NULL,
        packet_id    TEXT,
        event_type   TEXT NOT NULL,
        action       TEXT NOT NULL,
        occurred_at  TEXT NOT NULL,
        recorded_at  TEXT NOT NULL,
        actor_id     TEXT,
        outcome      TEXT NOT NULL,
        correlation_id TEXT,
        causation_id TEXT,
        details_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_case_sequence
      ON audit_events(case_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_audit_events_correlation_sequence
      ON audit_events(correlation_id, sequence);
    `);

    this.ensureColumn("event_id", "TEXT");
    this.ensureColumn("schema_version", "INTEGER");
    this.ensureColumn("correlation_id", "TEXT");
    this.ensureColumn("causation_id", "TEXT");
  }

  private ensureColumn(name: string, definition: string): void {
    const columns = this.db
      .prepare("PRAGMA table_info(audit_events)")
      .all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === name)) {
      this.db.exec(`ALTER TABLE audit_events ADD COLUMN ${name} ${definition}`);
    }
  }

  async append(event: AuditEventRecord): Promise<void> {
    const validatedEvent = validateAuditEventRecord(event);
    this.db
      .prepare(
        `INSERT INTO audit_events (
          audit_id,
          event_id,
          schema_version,
          case_id,
          packet_id,
          event_type,
          action,
          occurred_at,
          recorded_at,
          actor_id,
          outcome,
          correlation_id,
          causation_id,
          details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        validatedEvent.auditId,
        validatedEvent.eventId,
        validatedEvent.schemaVersion,
        validatedEvent.caseId,
        validatedEvent.packetId ?? null,
        validatedEvent.eventType,
        validatedEvent.action,
        validatedEvent.occurredAt,
        validatedEvent.recordedAt,
        validatedEvent.actorId ?? null,
        validatedEvent.outcome,
        validatedEvent.correlationId,
        validatedEvent.causationId ?? null,
        JSON.stringify(validatedEvent.details ?? {}),
      );
  }

  async listByCase(caseId: string, options?: PaginationOptions): Promise<AuditEventRecord[]> {
    return listSqliteAuditEventsByField(this.db, "case_id", caseId, options);
  }

  async listByCorrelationId(correlationId: string): Promise<AuditEventRecord[]> {
    return listSqliteAuditEventsByField(this.db, "correlation_id", correlationId);
  }

  async countEvents(): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM audit_events").get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}