import Database from "better-sqlite3";
import type { AuditEventRecord, AuditTrailStore } from "../domain/personal-doctor";

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
        case_id      TEXT NOT NULL,
        packet_id    TEXT,
        event_type   TEXT NOT NULL,
        action       TEXT NOT NULL,
        occurred_at  TEXT NOT NULL,
        recorded_at  TEXT NOT NULL,
        actor_id     TEXT,
        outcome      TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_case_sequence
      ON audit_events(case_id, sequence);
    `);
  }

  async append(event: AuditEventRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO audit_events (
          audit_id,
          case_id,
          packet_id,
          event_type,
          action,
          occurred_at,
          recorded_at,
          actor_id,
          outcome,
          details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.auditId,
        event.caseId,
        event.packetId ?? null,
        event.eventType,
        event.action,
        event.occurredAt,
        event.recordedAt,
        event.actorId ?? null,
        event.outcome,
        JSON.stringify(event.details ?? {}),
      );
  }

  async listByCase(caseId: string): Promise<AuditEventRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT audit_id, case_id, packet_id, event_type, action, occurred_at, recorded_at, actor_id, outcome, details_json
         FROM audit_events
         WHERE case_id = ?
         ORDER BY sequence ASC`
      )
      .all(caseId) as Array<{
        audit_id: string;
        case_id: string;
        packet_id: string | null;
        event_type: AuditEventRecord["eventType"];
        action: string;
        occurred_at: string;
        recorded_at: string;
        actor_id: string | null;
        outcome: AuditEventRecord["outcome"];
        details_json: string;
      }>;

    return rows.map((row) => ({
      auditId: row.audit_id,
      caseId: row.case_id,
      packetId: row.packet_id ?? undefined,
      eventType: row.event_type,
      action: row.action,
      occurredAt: row.occurred_at,
      recordedAt: row.recorded_at,
      actorId: row.actor_id ?? undefined,
      outcome: row.outcome,
      details: JSON.parse(row.details_json) as AuditEventRecord["details"],
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