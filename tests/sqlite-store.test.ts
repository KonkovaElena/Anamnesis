import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { AnamnesisCase } from "../src/domain/anamnesis";
import { SqliteAnamnesisStore } from "../src/infrastructure/SqliteAnamnesisStore";

const TEST_KEY = randomBytes(32);

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pd-test-"));
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

function makeCase(overrides?: Partial<AnamnesisCase>): AnamnesisCase {
  const now = new Date().toISOString();
  return {
    caseId: randomUUID(),
    patientLabel: "Test Patient",
    status: "INTAKING",
    createdAt: now,
    updatedAt: now,
    intake: {
      chiefConcern: "headache",
      symptomSummary: "persistent",
      historySummary: "none",
      questionsForClinician: ["frequency?"],
    },
    artifacts: [],
    physicianPackets: [],
    ...overrides,
  };
}

test("saveCase + getCase roundtrip", async () => {
  const dir = makeTempDir();
  try {
    const store = new SqliteAnamnesisStore({ dbPath: join(dir, "test.db"), encryptionKey: TEST_KEY });
    const c = makeCase();
    await store.saveCase(c);

    const retrieved = await store.getCase(c.caseId);
    assert.deepStrictEqual(retrieved, c);
    store.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("getCase returns undefined for missing id", async () => {
  const dir = makeTempDir();
  try {
    const store = new SqliteAnamnesisStore({ dbPath: join(dir, "test.db"), encryptionKey: TEST_KEY });
    const result = await store.getCase("missing-id");
    assert.equal(result, undefined);
    store.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("listCases returns cases sorted by createdAt descending", async () => {
  const dir = makeTempDir();
  try {
    const store = new SqliteAnamnesisStore({ dbPath: join(dir, "test.db"), encryptionKey: TEST_KEY });

    const older = makeCase({ createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z" });
    const newer = makeCase({ createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" });
    await store.saveCase(older);
    await store.saveCase(newer);

    const list = await store.listCases();
    assert.equal(list.length, 2);
    assert.equal(list[0].caseId, newer.caseId);
    assert.equal(list[1].caseId, older.caseId);
    store.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("saveCase upserts on existing caseId", async () => {
  const dir = makeTempDir();
  try {
    const store = new SqliteAnamnesisStore({ dbPath: join(dir, "test.db"), encryptionKey: TEST_KEY });
    const c = makeCase();
    await store.saveCase(c);

    const updated = { ...c, patientLabel: "Updated Patient", updatedAt: new Date().toISOString() };
    await store.saveCase(updated);

    const list = await store.listCases();
    assert.equal(list.length, 1);
    assert.equal(list[0].patientLabel, "Updated Patient");
    store.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("deleteCase returns true for existing case", async () => {
  const dir = makeTempDir();
  try {
    const store = new SqliteAnamnesisStore({ dbPath: join(dir, "test.db"), encryptionKey: TEST_KEY });
    const c = makeCase();
    await store.saveCase(c);

    const deleted = await store.deleteCase(c.caseId);
    assert.equal(deleted, true);

    const retrieved = await store.getCase(c.caseId);
    assert.equal(retrieved, undefined);
    store.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("deleteCase returns false for missing case", async () => {
  const dir = makeTempDir();
  try {
    const store = new SqliteAnamnesisStore({ dbPath: join(dir, "test.db"), encryptionKey: TEST_KEY });
    const deleted = await store.deleteCase("nonexistent");
    assert.equal(deleted, false);
    store.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("data persists across store instances", async () => {
  const dir = makeTempDir();
  try {
    const dbPath = join(dir, "persist.db");
    const c = makeCase();

    const store1 = new SqliteAnamnesisStore({ dbPath, encryptionKey: TEST_KEY });
    await store1.saveCase(c);
    store1.close();

    const store2 = new SqliteAnamnesisStore({ dbPath, encryptionKey: TEST_KEY });
    const retrieved = await store2.getCase(c.caseId);
    assert.deepStrictEqual(retrieved, c);
    store2.close();
  } finally {
    await cleanupTempDir(dir);
  }
});

test("data is actually encrypted on disk (not plaintext)", async () => {
  const { readFileSync } = await import("node:fs");
  const dir = makeTempDir();
  try {
    const dbPath = join(dir, "enc.db");
    const c = makeCase({ patientLabel: "UNIQUE_PATIENT_MARKER_12345" });

    const store = new SqliteAnamnesisStore({ dbPath, encryptionKey: TEST_KEY });
    await store.saveCase(c);
    store.close();

    const raw = readFileSync(dbPath, "utf8");
    assert.equal(raw.includes("UNIQUE_PATIENT_MARKER_12345"), false, "Patient data found in plaintext on disk");
  } finally {
    await cleanupTempDir(dir);
  }
});
