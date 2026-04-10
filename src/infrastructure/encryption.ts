import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const TOKEN_VERSION = "v1";

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a versioned token: `v1:<iv-hex>:<tag-hex>:<ciphertext-hex>`.
 * The version prefix enables future algorithm migration without data loss.
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${TOKEN_VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a token produced by `encrypt()`.
 * Supports both versioned (`v1:iv:tag:ct`) and legacy (`iv:tag:ct`) formats.
 * Throws on tampered or invalid data.
 */
export function decrypt(token: string, key: Buffer): string {
  const parts = token.split(":");

  let iv: Buffer;
  let tag: Buffer;
  let ciphertext: Buffer;

  if (parts.length === 4 && parts[0] === TOKEN_VERSION) {
    iv = Buffer.from(parts[1], "hex");
    tag = Buffer.from(parts[2], "hex");
    ciphertext = Buffer.from(parts[3], "hex");
  } else if (parts.length === 3) {
    iv = Buffer.from(parts[0], "hex");
    tag = Buffer.from(parts[1], "hex");
    ciphertext = Buffer.from(parts[2], "hex");
  } else {
    throw new Error("Invalid encrypted token format");
  }

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Invalid encrypted token: IV or tag length mismatch");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Parse a 64-character hex string into a 32-byte key buffer.
 * Throws with a clear message on invalid input.
 */
export function parseEncryptionKey(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters (256 bits)");
  }
  return Buffer.from(hex, "hex");
}
