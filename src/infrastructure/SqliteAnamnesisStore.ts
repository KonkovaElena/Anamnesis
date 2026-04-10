import Database from "better-sqlite3";
import type { AnamnesisCase, AnamnesisStore, PaginationOptions } from "../domain/anamnesis";
import { clampPagination } from "../domain/anamnesis/store-contracts";
import { decrypt, encrypt } from "./encryption";

export interface SqliteStoreOptions {
  dbPath: string;
  encryptionKey: Buffer;
}

export class SqliteAnamnesisStore implements AnamnesisStore {
  private readonly db: Database.Database;
  private readonly key: Buffer;

  constructor(options: SqliteStoreOptions) {
    this.key = options.encryptionKey;
    this.db = new Database(options.dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cases (
        case_id      TEXT PRIMARY KEY,
        encrypted_data TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      )
    `);
  }

  async listCases(options?: PaginationOptions): Promise<AnamnesisCase[]> {
    const { limit, offset } = clampPagination(options);
    const rows = this.db
      .prepare("SELECT encrypted_data FROM cases ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Array<{ encrypted_data: string }>;

    return rows.map((row) => JSON.parse(decrypt(row.encrypted_data, this.key)));
  }

  async getCase(caseId: string): Promise<AnamnesisCase | undefined> {
    const row = this.db
      .prepare("SELECT encrypted_data FROM cases WHERE case_id = ?")
      .get(caseId) as { encrypted_data: string } | undefined;

    if (!row) return undefined;
    return JSON.parse(decrypt(row.encrypted_data, this.key));
  }

  async saveCase(nextCase: AnamnesisCase): Promise<void> {
    const encrypted = encrypt(JSON.stringify(nextCase), this.key);

    this.db
      .prepare(
        `INSERT INTO cases (case_id, encrypted_data, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(case_id) DO UPDATE SET
           encrypted_data = excluded.encrypted_data,
           updated_at     = excluded.updated_at`
      )
      .run(nextCase.caseId, encrypted, nextCase.createdAt, nextCase.updatedAt);
  }

  async deleteCase(caseId: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM cases WHERE case_id = ?").run(caseId);
    return result.changes > 0;
  }

  /** Close the database connection. Call on shutdown. */
  close(): void {
    this.db.close();
  }
}
