---
title: "Anamnesis Backup, Restore, And Key Rotation Runbook"
status: active
version: "1.0.0"
last_updated: "2026-04-12"
tags: [anamnesis, security, operations, backup, restore, key-rotation]
---

# Backup, Restore, And Key Rotation Runbook

## Purpose

Define the current operator procedure for backing up, restoring, and rotating key material in the standalone Anamnesis runtime.

This is a current-state runbook. It documents what the repository supports now, what must still be done manually, and what is not implemented yet.

## External Basis

- HHS HIPAA Security Rule summary continues to treat contingency planning, backup, restore, integrity, authentication, and documentation as operational safeguards rather than optional prose.
- NIST SP 800-66 Rev. 2 continues to frame HIPAA security as risk-managed operations that require procedures, evaluation, and documented implementation choices.

This runbook is aligned with that operator mindset. It is not a legal-compliance statement.

## Scope

This runbook covers:

- the SQLite case store behind `STORE_PATH`;
- the AES-256-GCM store key provided through `ENCRYPTION_KEY`;
- application auth material provided through `API_KEY`, `JWT_SECRET`, or `JWT_PUBLIC_KEY`;
- the current manual restore and restart workflow.

This runbook does not claim:

- automated backup scheduling;
- in-place encrypted-store key rotation;
- JWKS or `kid`-aware JWT rollover;
- detached audit export or external notarization;
- full disaster-recovery orchestration.

## Current-State Support Matrix

| Procedure | Supported now | Notes |
| --- | --- | --- |
| Cold backup of SQLite store | Yes | Preferred path. Stop the process before copying the database artifacts. |
| Restore from encrypted SQLite backup | Yes | Requires the same `ENCRYPTION_KEY` that was used for the backup. |
| Restart-time `API_KEY` rotation | Yes | Old token stops working after restart. |
| Restart-time `JWT_SECRET` replacement | Yes | Requires coordinated issuer and verifier cutover. |
| Restart-time `JWT_PUBLIC_KEY` replacement | Yes | Single-key verifier only; no built-in overlap window. |
| In-place `ENCRYPTION_KEY` rotation for existing data | No | Repository does not ship multi-key decrypt or re-encryption tooling. |
| Automatic backup verification and restore drill scheduling | No | Must be performed operationally outside the repository. |

## Prerequisites

Before treating any backup as real:

1. know the exact `STORE_PATH` used by the running instance;
2. know how `ENCRYPTION_KEY` is stored and how it will be recovered out of band;
3. define an owner for backup creation and restore testing;
4. define acceptable RPO and RTO targets for the deployment;
5. ensure the deployment can be stopped gracefully.

Do not store the only copy of `ENCRYPTION_KEY` inside the same bundle as the encrypted database file.

## Cold Backup Procedure

Preferred procedure for the current repository:

1. Stop new writes by taking the instance out of service.
2. Shut the process down cleanly.
3. Copy the SQLite database file at `STORE_PATH`.
4. If present, also copy the sibling `-wal` and `-shm` files.
5. Record a SHA-256 checksum for each copied file.
6. Record the secret reference or operator location for `ENCRYPTION_KEY` separately from the database copy.
7. Record the backup timestamp, application version, and deployment identifier.

PowerShell example:

```powershell
$db = "data\anamnesis.db"
$dest = "backup\2026-04-12"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $db $dest
Copy-Item "$db-wal" $dest -ErrorAction SilentlyContinue
Copy-Item "$db-shm" $dest -ErrorAction SilentlyContinue
Get-FileHash "$dest\anamnesis.db" -Algorithm SHA256
```

POSIX example:

```bash
db="data/anamnesis.db"
dest="backup/2026-04-12"
mkdir -p "$dest"
cp "$db" "$dest/"
cp "$db-wal" "$dest/" 2>/dev/null || true
cp "$db-shm" "$dest/" 2>/dev/null || true
shasum -a 256 "$dest/anamnesis.db"
```

### Backup Success Signal

A backup is only considered complete when all of the following are true:

- the database copy exists;
- the `-wal` and `-shm` sidecars were copied when present;
- checksums were recorded;
- the corresponding `ENCRYPTION_KEY` recovery path was recorded separately;
- the backup can be traced to a specific deployment and timestamp.

## Restore Procedure

Current supported restore path:

1. Stop the target Anamnesis process.
2. Place the backup database file back at `STORE_PATH`.
3. Restore matching `-wal` and `-shm` files if the backup set includes them.
4. Start the process with the same `ENCRYPTION_KEY` used when the backup was created.
5. Verify startup through `GET /healthz` and `GET /readyz`.
6. Verify application visibility through `GET /api/operations/summary`.
7. Verify that representative case counts match the expected backup state.

### Restore Failure Modes

- If `ENCRYPTION_KEY` is wrong, encrypted case records will not decrypt correctly.
- If `STORE_PATH` points to the wrong file, the process may start against the wrong dataset.
- If only part of the SQLite file set is restored, data may be stale or incomplete.

### Restore Success Signal

Treat restore as complete only when the service starts, health probes pass, and the case and audit counts match the expected backup snapshot.

## Key Handling And Rotation

### `API_KEY`

Current rotation model:

1. generate a new opaque token;
2. distribute it to authorized operators;
3. restart the service with the new `API_KEY`;
4. confirm old API-key requests now fail with `401`.

There is no dual-key overlap model in the repository.

### `JWT_SECRET`

Current rotation model:

1. rotate the issuer and verifier together;
2. restart Anamnesis with the replacement `JWT_SECRET`;
3. verify a newly issued token succeeds;
4. verify a token signed with the retired secret fails.

This is a coordinated shared-secret cutover, not a graceful rolling overlap.

### `JWT_PUBLIC_KEY`

Current rotation model:

1. rotate the issuer signing key first;
2. update `JWT_PUBLIC_KEY` on the verifier;
3. restart Anamnesis;
4. verify a token signed by the new private key succeeds;
5. verify a token signed by the old private key fails if the issuer is no longer supposed to trust it.

The current repository accepts one verifier key only. There is no built-in `kid` routing, JWKS fetch, or overlap window.

### `ENCRYPTION_KEY`

Current repository boundary:

- restoring an existing encrypted store with the same `ENCRYPTION_KEY` is supported;
- rotating `ENCRYPTION_KEY` for a new empty deployment is supported;
- rotating `ENCRYPTION_KEY` in place for an existing encrypted store is not implemented.

For an existing populated store, treat `ENCRYPTION_KEY` rotation as a separate migration project. The safe current posture is:

1. take a verified cold backup;
2. keep the old key available until the migration is proven;
3. build and test one-off migration tooling outside the normal runtime path;
4. validate restored counts and representative records before decommissioning the old encrypted copy.

Do not claim routine in-place `ENCRYPTION_KEY` rotation from the current repository state.

## Minimum Recovery Discipline

At minimum, operators should:

1. perform a restore drill after major releases or deployment changes;
2. track the last successful restore drill date;
3. store backup artifacts and secret recovery paths in separate trust boundaries;
4. document who can authorize restore and key replacement;
5. treat lost `ENCRYPTION_KEY` material as a data-loss event and compromised `ENCRYPTION_KEY` material as a confidentiality incident.

## Related Surfaces

- [posture-and-gaps.md](posture-and-gaps.md)
- [crypto-agility-inventory.md](crypto-agility-inventory.md)
- [../roadmap-and-validation.md](../roadmap-and-validation.md)
- [../../README.md](../../README.md)