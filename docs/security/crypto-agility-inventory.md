---
title: "Anamnesis Cryptographic Inventory And Agility Assessment"
status: active
version: "1.0.0"
last_updated: "2026-04-08"
tags: [anamnesis, security, cryptography, inventory]
---

# Cryptographic Inventory And Agility Assessment

## Purpose

Enumerate every cryptographic primitive currently used by the Anamnesis runtime, assess migration readiness, and define the planned path toward key rotation, algorithm versioning, and envelope-encryption support.

This document is a planning and transparency surface, not a claim of cryptographic certification.

## Current Primitive Inventory

| Primitive | Algorithm | Parameters | Code anchor | Role |
| --- | --- | --- | --- | --- |
| Data-at-rest encryption | AES-256-GCM | 12-byte random IV, 16-byte auth tag, 256-bit key | `src/infrastructure/encryption.ts` | Whole-record case encryption in SQLite store |
| Key parsing | Raw hex decode | 64-character hex string → 32-byte buffer | `src/infrastructure/encryption.ts` `parseEncryptionKey()` | Converts `ENCRYPTION_KEY` env var to key material |
| ID generation | UUID v4 | `node:crypto` `randomUUID()` | `src/core/ids.ts` | Case, artifact, packet, review, and audit identifiers |
| Request correlation | UUID v4 | `node:crypto` `randomUUID()` | `src/application/create-app.ts` | `x-request-id` header generation when not supplied |
| Bearer authentication | String comparison | Constant-time not currently guaranteed | `src/application/auth-middleware.ts` | Compares `Authorization` header against `API_KEY` |

## Token Format

Encrypted records use the format `<iv-hex>:<tag-hex>:<ciphertext-hex>`.

This format does not include:

- algorithm identifier;
- key version identifier;
- creation timestamp;
- any envelope metadata.

Migration implication: all existing records are implicitly AES-256-GCM with the single configured key. A future format must be distinguishable from the current one (for example, by a version prefix) so that old and new records can coexist during rotation.

## Key Management State

| Property | Current state | Target state |
| --- | --- | --- |
| Key source | Single `ENCRYPTION_KEY` environment variable | Secret manager or HSM-backed key store |
| Key derivation | None (raw hex input) | HKDF or Argon2id derivation from a master secret |
| Key rotation | Not implemented | Automated re-encryption with versioned key slots |
| Key versioning | None (single implicit key) | Per-record key-version tag in token prefix |
| Envelope encryption | Not implemented | Data-encryption key (DEK) wrapped by a key-encryption key (KEK) |
| Backup key escrow | Not documented | Offline escrow with split-knowledge or M-of-N recovery |

## Quantum Readiness Assessment

AES-256 is generally considered quantum-resistant: Grover's algorithm halves the effective key length to 128 bits, which remains beyond practical brute-force reach under current projections (NIST IR 8413, 2024).

The Anamnesis slice does not use:

- RSA or ECDSA (no asymmetric signing);
- Diffie-Hellman key exchange;
- TLS termination (handled by deployment infrastructure).

Therefore the NIST 2035 deprecation horizon for vulnerable asymmetric primitives does not directly apply to the current runtime crypto surface. No immediate post-quantum migration is required.

Should the slice later adopt:

- cryptographic audit-log signatures (e.g., Ed25519 or ECDSA chains);
- TLS in-process;
- asymmetric envelope encryption;

then the migration plan must include NIST PQC alternatives: ML-KEM for key encapsulation, ML-DSA or SLH-DSA for signatures (FIPS 203, 204, 205).

## Migration Plan

### Phase A: Token Format Versioning

Add a one-byte version prefix to the encrypted token format so that future algorithm or key changes are distinguishable from legacy records.

Proposed format: `v1:<iv-hex>:<tag-hex>:<ciphertext-hex>`.

Records without a `v` prefix are treated as legacy v0 (current format). This is backward-compatible and requires no re-encryption.

### Phase B: Key Rotation Support

Introduce a `KEY_VERSION` identifier alongside `ENCRYPTION_KEY`. The decryption path reads the version prefix from the stored token and selects the matching key. New writes always use the latest key version.

A background re-encryption sweep can migrate legacy records to the current key version during low-traffic windows.

### Phase C: Envelope Encryption

Separate data-encryption keys (DEK) from a key-encryption key (KEK):

1. Each record is encrypted with a unique or per-session DEK.
2. The DEK is wrapped (encrypted) by the KEK.
3. Only the KEK needs to be rotated or escrowed.

This reduces the blast radius of a single key compromise and aligns with cloud KMS patterns.

### Phase D: Audit-Log Signing (Future)

If append-only audit events require tamper evidence beyond application-level controls:

1. Choose a signing algorithm with quantum migration path (Ed25519 now, SLH-DSA later).
2. Sign each audit event with a per-instance signing key.
3. Chain signatures for causal ordering verification.

This is not planned for the current release but is documented here so the future implementation does not introduce a quantum-vulnerable primitive.

## Constant-Time Comparison Note

The current bearer-auth middleware uses standard string comparison for `API_KEY` matching. While timing attacks against bearer tokens over HTTP are difficult to exploit in practice (network jitter dominates), a future hardening pass should migrate to `crypto.timingSafeEqual()` for defense in depth.

## Related Surfaces

- [posture-and-gaps.md](posture-and-gaps.md)
- [../claim-boundary.md](../claim-boundary.md)
- [../../src/infrastructure/encryption.ts](../../src/infrastructure/encryption.ts)
- [../../tests/encryption.test.ts](../../tests/encryption.test.ts)
