import Database from "better-sqlite3";
import { validateAuditEventRecord } from "../core/audit-events";
import type { AuditEventRecord, AuditTrailStore } from "../domain/anamnesis";

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

  async listByCase(caseId: string): Promise<AuditEventRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT audit_id, event_id, schema_version, case_id, packet_id, event_type, action, occurred_at, recorded_at, actor_id, outcome, correlation_id, causation_id, details_json
         FROM audit_events
         WHERE case_id = ?
         ORDER BY sequence ASC`
      )
      .all(caseId) as Array<{
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
      }>;

    return rows.map((row) => validateAuditEventRecord({
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
      schemaVersion: row.schema_version === 1 ? 1 : 1,
    }));
  }

  async listByCorrelationId(correlationId: string): Promise<AuditEventRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT audit_id, event_id, schema_version, case_id, packet_id, event_type, action, occurred_at, recorded_at, actor_id, outcome, correlation_id, causation_id, details_json
         FROM audit_events
         WHERE correlation_id = ?
         ORDER BY sequence ASC`
      )
      .all(correlationId) as Array<{
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
      }>;

    return rows.map((row) => validateAuditEventRecord({
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
      schemaVersion: row.schema_version === 1 ? 1 : 1,
    }));
  }

  async countEvents(): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM audit_events").get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}