import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { verifyAuditChain, type ChainedAuditEventRecord } from "../src/core/audit-events";

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
  chainHash?: string;
}

interface AuditTrailStoreView {
  append(event: AuditEventView): Promise<void>;
  listByCase(caseId: string): Promise<AuditEventView[]>;
  listByCorrelationId(correlationId: string): Promise<AuditEventView[]>;
  countEvents(): Promise<number>;
  getLastChainHash(): Promise<string>;
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

async function cleanupTempDir(dir: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "ENOTEMPTY") {
        throw error;
      }

      lastError = error;
      await delay(50 * (attempt + 1));
    }
  }

  throw lastError;
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
    await cleanupTempDir(dir);
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
    await cleanupTempDir(dir);
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
    await cleanupTempDir(dir);
  }
});

test("SqliteAuditTrailStore persists hash-chain values and verifies them across reopen", async () => {
  const SqliteAuditTrailStore = await loadSqliteAuditTrailStore();
  const dir = makeTempDir();
  const dbPath = join(dir, "audit.db");
  let store1: AuditTrailStoreView | undefined;
  let store2: AuditTrailStoreView | undefined;

  try {
    store1 = new SqliteAuditTrailStore({ dbPath });
    await store1.append(makeEvent({ caseId: "case-chain", eventType: "case.created", action: "create_case" }));
    await store1.append(makeEvent({ caseId: "case-chain", eventType: "artifact.added", action: "add_artifact", occurredAt: "2026-03-31T10:02:00.000Z", recordedAt: "2026-03-31T10:02:00.000Z" }));
    await store1.append(makeEvent({ caseId: "case-chain", eventType: "packet.finalized", action: "finalize_packet", occurredAt: "2026-03-31T10:05:00.000Z", recordedAt: "2026-03-31T10:05:00.000Z" }));

    const firstRead = (await store1.listByCase("case-chain")) as ChainedAuditEventRecord[];
    assert.equal(firstRead.length, 3);
    assert.ok(firstRead.every((event) => typeof event.chainHash === "string" && event.chainHash.length === 64));

    const firstVerification = verifyAuditChain(firstRead);
    assert.deepStrictEqual(firstVerification, {
      valid: true,
      verifiedCount: 3,
    });
    assert.equal(await store1.getLastChainHash(), firstRead.at(-1)?.chainHash);

    store1.close();
    store1 = undefined;

    store2 = new SqliteAuditTrailStore({ dbPath });
    const secondRead = (await store2.listByCase("case-chain")) as ChainedAuditEventRecord[];
    assert.equal(secondRead.length, 3);
    assert.deepStrictEqual(
      secondRead.map((event) => event.chainHash),
      firstRead.map((event) => event.chainHash),
    );

    const secondVerification = verifyAuditChain(secondRead);
    assert.deepStrictEqual(secondVerification, {
      valid: true,
      verifiedCount: 3,
    });
    assert.equal(await store2.getLastChainHash(), secondRead.at(-1)?.chainHash);
  } finally {
    store2?.close();
    store1?.close();
    await cleanupTempDir(dir);
  }
});