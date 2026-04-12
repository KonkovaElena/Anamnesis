import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeAuditEvent,
  computeChainHash,
  GENESIS_CHAIN_HASH,
  verifyAuditChain,
  type ChainedAuditEventRecord,
  createAuditEvent,
} from "../src/domain/anamnesis";
import { InMemoryAuditTrailStore } from "../src/infrastructure/InMemoryAuditTrailStore";

function makeEvent(caseId: string, eventType: "case.created" | "artifact.added" = "case.created") {
  return createAuditEvent({
    caseId,
    eventType,
    action: `${eventType} for ${caseId}`,
    occurredAt: new Date().toISOString(),
  });
}

test("GENESIS_CHAIN_HASH is 64-char hex zero string", () => {
  assert.equal(GENESIS_CHAIN_HASH.length, 64);
  assert.match(GENESIS_CHAIN_HASH, /^0{64}$/);
});

test("canonicalizeAuditEvent produces deterministic JSON", () => {
  const event = makeEvent("case-1");
  const a = canonicalizeAuditEvent(event);
  const b = canonicalizeAuditEvent(event);
  assert.equal(a, b);
  assert.equal(typeof JSON.parse(a), "object");
});

test("canonicalizeAuditEvent normalizes optional fields to null", () => {
  const event = makeEvent("case-1");
  const canonical = JSON.parse(canonicalizeAuditEvent(event));
  assert.equal(canonical.packetId, null);
  assert.equal(canonical.causationId, null);
});

test("computeChainHash returns a 64-char hex string", () => {
  const event = makeEvent("case-1");
  const hash = computeChainHash(event, GENESIS_CHAIN_HASH);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("computeChainHash is deterministic for same inputs", () => {
  const event = makeEvent("case-1");
  const hash1 = computeChainHash(event, GENESIS_CHAIN_HASH);
  const hash2 = computeChainHash(event, GENESIS_CHAIN_HASH);
  assert.equal(hash1, hash2);
});

test("computeChainHash changes when prevHash differs", () => {
  const event = makeEvent("case-1");
  const hash1 = computeChainHash(event, GENESIS_CHAIN_HASH);
  const hash2 = computeChainHash(event, "a".repeat(64));
  assert.notEqual(hash1, hash2);
});

test("computeChainHash changes when event content differs", () => {
  const event1 = makeEvent("case-1");
  const event2 = makeEvent("case-2");
  const hash1 = computeChainHash(event1, GENESIS_CHAIN_HASH);
  const hash2 = computeChainHash(event2, GENESIS_CHAIN_HASH);
  assert.notEqual(hash1, hash2);
});

test("verifyAuditChain validates an empty chain", () => {
  const result = verifyAuditChain([]);
  assert.equal(result.valid, true);
  assert.equal(result.verifiedCount, 0);
});

test("verifyAuditChain validates a single-event chain", () => {
  const event = makeEvent("case-1");
  const chainHash = computeChainHash(event, GENESIS_CHAIN_HASH);
  const chained: ChainedAuditEventRecord = { ...event, chainHash };

  const result = verifyAuditChain([chained]);
  assert.equal(result.valid, true);
  assert.equal(result.verifiedCount, 1);
});

test("verifyAuditChain validates a multi-event chain", () => {
  const events = [makeEvent("case-1"), makeEvent("case-1", "artifact.added")];

  const hash0 = computeChainHash(events[0]!, GENESIS_CHAIN_HASH);
  const hash1 = computeChainHash(events[1]!, hash0);

  const chain: ChainedAuditEventRecord[] = [
    { ...events[0]!, chainHash: hash0 },
    { ...events[1]!, chainHash: hash1 },
  ];

  const result = verifyAuditChain(chain);
  assert.equal(result.valid, true);
  assert.equal(result.verifiedCount, 2);
});

test("verifyAuditChain detects tampered event in the middle", () => {
  const events = [makeEvent("case-1"), makeEvent("case-1", "artifact.added")];

  const hash0 = computeChainHash(events[0]!, GENESIS_CHAIN_HASH);
  const hash1 = computeChainHash(events[1]!, hash0);

  const tampered: ChainedAuditEventRecord[] = [
    { ...events[0]!, chainHash: hash0 },
    { ...events[1]!, chainHash: "f".repeat(64) },
  ];

  const result = verifyAuditChain(tampered);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAtIndex, 1);
  assert.equal(result.expectedHash, hash1);
  assert.equal(result.actualHash, "f".repeat(64));
});

test("verifyAuditChain detects tampered first event", () => {
  const event = makeEvent("case-1");
  const tampered: ChainedAuditEventRecord[] = [
    { ...event, chainHash: "a".repeat(64) },
  ];

  const result = verifyAuditChain(tampered);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAtIndex, 0);
});

test("InMemoryAuditTrailStore computes chain hashes on append", async () => {
  const store = new InMemoryAuditTrailStore();
  const event1 = makeEvent("case-chain");
  const event2 = makeEvent("case-chain", "artifact.added");

  await store.append(event1);
  await store.append(event2);

  const events = await store.listByCase("case-chain");
  assert.equal(events.length, 2);
  assert.ok(events[0]!.chainHash);
  assert.ok(events[1]!.chainHash);
  assert.notEqual(events[0]!.chainHash, events[1]!.chainHash);

  const result = verifyAuditChain(events);
  assert.equal(result.valid, true);
  assert.equal(result.verifiedCount, 2);
});

test("InMemoryAuditTrailStore.getLastChainHash returns genesis for empty store", async () => {
  const store = new InMemoryAuditTrailStore();
  const hash = await store.getLastChainHash();
  assert.equal(hash, GENESIS_CHAIN_HASH);
});

test("InMemoryAuditTrailStore.getLastChainHash returns last hash after appends", async () => {
  const store = new InMemoryAuditTrailStore();
  const event = makeEvent("case-hash");
  await store.append(event);

  const lastHash = await store.getLastChainHash();
  assert.notEqual(lastHash, GENESIS_CHAIN_HASH);
  assert.equal(lastHash.length, 64);
});

test("audit chain across multiple cases maintains global ordering", async () => {
  const store = new InMemoryAuditTrailStore();

  await store.append(makeEvent("case-a"));
  await store.append(makeEvent("case-b"));
  await store.append(makeEvent("case-a", "artifact.added"));

  const eventsA = await store.listByCase("case-a");
  const eventsB = await store.listByCase("case-b");

  assert.equal(eventsA.length, 2);
  assert.equal(eventsB.length, 1);

  assert.ok(eventsA[0]!.chainHash);
  assert.ok(eventsB[0]!.chainHash);
  assert.ok(eventsA[1]!.chainHash);
});
