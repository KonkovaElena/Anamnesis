import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

interface AuditEventView {
  auditId: string;
  caseId: string;
  packetId?: string;
  eventType: string;
  action: string;
  occurredAt: string;
  recordedAt: string;
  actorId?: string;
  outcome: string;
  details?: Record<string, unknown>;
}

interface AuditTrailStoreView {
  append(event: AuditEventView): Promise<void>;
  listByCase(caseId: string): Promise<AuditEventView[]>;
  countEvents(): Promise<number>;
  close(): void;
}

type SqliteAuditTrailStoreCtor = new (options: { dbPath: string }) => AuditTrailStoreView;

async function loadSqliteAuditTrailStore(): Promise<SqliteAuditTrailStoreCtor> {
  try {
    const moduleNamespace = (await import("../src/infrastructure/SqliteAuditTrailStore")) as Record<string, unknown>;
    const ctor = moduleNamespace.SqliteAuditTrailStore;
    assert.equal(typeof ctor, "function", "SqliteAuditTrailStore export missing");
    return ctor as SqliteAuditTrailStoreCtor;
  } catch (error) {
    assert.fail(`SqliteAuditTrailStore module missing: ${String(error)}`);
  }
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pd-audit-"));
}

function makeEvent(overrides?: Partial<AuditEventView>): AuditEventView {
  return {
    auditId: overrides?.auditId ?? `audit-${Math.random().toString(16).slice(2)}`,
    caseId: overrides?.caseId ?? "case-1",
    packetId: overrides?.packetId,
    eventType: overrides?.eventType ?? "case.created",
    action: overrides?.action ?? "create_case",
    occurredAt: overrides?.occurredAt ?? "2026-03-31T10:00:00.000Z",
    recordedAt: overrides?.recordedAt ?? "2026-03-31T10:00:00.000Z",
    actorId: overrides?.actorId,
    outcome: overrides?.outcome ?? "success",
    details: overrides?.details ?? { source: "test" },
  };
}

test("SqliteAuditTrailStore appends and lists case-scoped audit events in order", async () => {
  const SqliteAuditTrailStore = await loadSqliteAuditTrailStore();
  const dir = makeTempDir();

  try {
    const store = new SqliteAuditTrailStore({ dbPath: join(dir, "audit.db") });
    await store.append(makeEvent({ eventType: "case.created", action: "create_case" }));
    await store.append(makeEvent({ eventType: "packet.finalized", action: "finalize_packet", occurredAt: "2026-03-31T10:05:00.000Z", recordedAt: "2026-03-31T10:05:00.000Z" }));

    const events = await store.listByCase("case-1");
    assert.deepStrictEqual(events.map((event) => event.eventType), ["case.created", "packet.finalized"]);
    assert.equal(await store.countEvents(), 2);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SqliteAuditTrailStore preserves audit history across store instances and delete events", async () => {
  const SqliteAuditTrailStore = await loadSqliteAuditTrailStore();
  const dir = makeTempDir();

  try {
    const dbPath = join(dir, "audit.db");
    const store1 = new SqliteAuditTrailStore({ dbPath });
    await store1.append(makeEvent({ eventType: "case.deleted", action: "delete_case", occurredAt: "2026-03-31T10:10:00.000Z", recordedAt: "2026-03-31T10:10:00.000Z" }));
    store1.close();

    const store2 = new SqliteAuditTrailStore({ dbPath });
    const events = await store2.listByCase("case-1");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "case.deleted");
    store2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});