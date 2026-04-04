import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

interface AuditEventView {
  auditId: string;
  eventId: string;
  caseId: string;
  packetId?: string;
  eventType: string;
  action: string;
  occurredAt: string;
  recordedAt: string;
  actorId?: string;
  outcome: string;
  correlationId: string;
  causationId?: string;
  schemaVersion: number;
  details?: Record<string, unknown>;
}

interface AuditTrailStoreView {
  append(event: AuditEventView): Promise<void>;
  listByCase(caseId: string): Promise<AuditEventView[]>;
  listByCorrelationId(correlationId: string): Promise<AuditEventView[]>;
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
  const eventId = overrides?.eventId ?? randomUUID();
  return {
    auditId: overrides?.auditId ?? eventId,
    eventId,
    caseId: overrides?.caseId ?? "case-1",
    packetId: overrides?.packetId,
    eventType: overrides?.eventType ?? "case.created",
    action: overrides?.action ?? "create_case",
    occurredAt: overrides?.occurredAt ?? "2026-03-31T10:00:00.000Z",
    recordedAt: overrides?.recordedAt ?? "2026-03-31T10:00:00.000Z",
    actorId: overrides?.actorId,
    outcome: overrides?.outcome ?? "success",
    correlationId: overrides?.correlationId ?? "corr_test_case_1",
    causationId: overrides?.causationId,
    schemaVersion: overrides?.schemaVersion ?? 1,
    details: overrides?.details ?? { source: "test" },
  };
}

test("SqliteAuditTrailStore appends and lists case-scoped audit events in order", async () => {
  const SqliteAuditTrailStore = await loadSqliteAuditTrailStore();
  const dir = makeTempDir();
  let store: AuditTrailStoreView | undefined;

  try {
    store = new SqliteAuditTrailStore({ dbPath: join(dir, "audit.db") });
    await store.append(makeEvent({ eventType: "case.created", action: "create_case" }));
    await store.append(makeEvent({ eventType: "packet.finalized", action: "finalize_packet", occurredAt: "2026-03-31T10:05:00.000Z", recordedAt: "2026-03-31T10:05:00.000Z" }));

    const events = await store.listByCase("case-1");
    assert.deepStrictEqual(events.map((event) => event.eventType), ["case.created", "packet.finalized"]);
    assert.equal(await store.countEvents(), 2);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("SqliteAuditTrailStore preserves audit history across store instances and delete events", async () => {
  const SqliteAuditTrailStore = await loadSqliteAuditTrailStore();
  const dir = makeTempDir();
  let store1: AuditTrailStoreView | undefined;
  let store2: AuditTrailStoreView | undefined;

  try {
    const dbPath = join(dir, "audit.db");
    store1 = new SqliteAuditTrailStore({ dbPath });
    await store1.append(makeEvent({ eventType: "case.deleted", action: "delete_case", occurredAt: "2026-03-31T10:10:00.000Z", recordedAt: "2026-03-31T10:10:00.000Z" }));
    store1.close();
    store1 = undefined;

    store2 = new SqliteAuditTrailStore({ dbPath });
    const events = await store2.listByCase("case-1");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.eventType, "case.deleted");
  } finally {
    store2?.close();
    store1?.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("SqliteAuditTrailStore lists audit events by correlation id across cases", async () => {
  const SqliteAuditTrailStore = await loadSqliteAuditTrailStore();
  const dir = makeTempDir();
  let store: AuditTrailStoreView | undefined;

  try {
    store = new SqliteAuditTrailStore({ dbPath: join(dir, "audit.db") });
    await store.append(makeEvent({ caseId: "case-1", correlationId: "corr_shared" }));
    await store.append(makeEvent({ caseId: "case-2", correlationId: "corr_shared", eventType: "packet.finalized", action: "finalize_packet" }));
    await store.append(makeEvent({ caseId: "case-3", correlationId: "corr_other" }));

    const events = await store.listByCorrelationId("corr_shared");
    assert.deepStrictEqual(events.map((event) => event.caseId), ["case-1", "case-2"]);
    assert.deepStrictEqual(events.map((event) => event.correlationId), ["corr_shared", "corr_shared"]);
    assert.ok(events.every((event) => event.schemaVersion === 1));
    assert.ok(events.every((event) => event.auditId === event.eventId));
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});