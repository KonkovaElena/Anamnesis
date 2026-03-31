import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decrypt, encrypt, parseEncryptionKey } from "../src/infrastructure/encryption";

const TEST_KEY = randomBytes(32);

test("encrypt → decrypt roundtrip preserves plaintext", () => {
  const plaintext = "Hello, encrypted world!";
  const token = encrypt(plaintext, TEST_KEY);
  const recovered = decrypt(token, TEST_KEY);
  assert.equal(recovered, plaintext);
});

test("roundtrip handles empty string", () => {
  const token = encrypt("", TEST_KEY);
  assert.equal(decrypt(token, TEST_KEY), "");
});

test("roundtrip handles unicode and JSON payloads", () => {
  const payload = JSON.stringify({ name: "Иванов И.И.", notes: "日本語テスト 🩺" });
  const token = encrypt(payload, TEST_KEY);
  assert.equal(decrypt(token, TEST_KEY), payload);
});

test("each encryption produces a different ciphertext (random IV)", () => {
  const plaintext = "same input twice";
  const a = encrypt(plaintext, TEST_KEY);
  const b = encrypt(plaintext, TEST_KEY);
  assert.notEqual(a, b);
});

test("decrypt fails with wrong key", () => {
  const token = encrypt("secret", TEST_KEY);
  const wrongKey = randomBytes(32);
  assert.throws(() => decrypt(token, wrongKey));
});

test("decrypt fails on tampered ciphertext", () => {
  const token = encrypt("secret", TEST_KEY);
  const parts = token.split(":");
  // flip a character in the ciphertext portion
  const corrupted = parts[2].replace(/[0-9a-f]/, (c) => (c === "0" ? "1" : "0"));
  assert.throws(() => decrypt(`${parts[0]}:${parts[1]}:${corrupted}`, TEST_KEY));
});

test("decrypt rejects malformed token", () => {
  assert.throws(() => decrypt("not:a:valid:token", TEST_KEY));
  assert.throws(() => decrypt("garbage", TEST_KEY));
});

test("parseEncryptionKey accepts valid 64-hex string", () => {
  const hex = randomBytes(32).toString("hex");
  const buf = parseEncryptionKey(hex);
  assert.equal(buf.length, 32);
});

test("parseEncryptionKey rejects short key", () => {
  assert.throws(() => parseEncryptionKey("abcd1234"), /64 hex characters/);
});

test("parseEncryptionKey rejects non-hex characters", () => {
  assert.throws(() => parseEncryptionKey("g".repeat(64)), /64 hex characters/);
});
