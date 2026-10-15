---
source: src/modules/audit-logs/tests/unit/schema-contract.test.ts
sha256: 4f0220efdd2a23999114bf8157153dd2c20a8e89ca90e178351063a03a85bbb5
generated_at: 2026-10-15T10:22:14.896164+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose

A compliance contract test that pins down the `auditLogSchema` (Mongoose) as a regulatory artifact rather than a convenience. It asserts the required fields, closed-set enums, schema options (`timestamps`, `bufferCommands`), index topology, and TTL retention window. Unlike typical unit tests, it documents *why* each constraint exists (e.g., a silent buffer would swallow audit-loss signals) and fails if the schema drifts from the operational contract.

## Key elements

- **`RETENTION_SECONDS`** – Computed from `currentEnvironment().NODE_AUDIT_RETENTION_DAYS` (default 90) × 86 400. Used to assert the TTL index `expireAfterSeconds` so the test tracks the configured value, not a literal.
- **`describe('…what an entry must carry')`** – Asserts the seven required paths (`action`, `actorRole`, `actorScope`, `actorUserId`, `level`, `outcome`, `timestamp`), the closed enums for `actorRole` / `outcome` / `level`, that `anonymous` is a valid role, and that `actorRoleName` is present but optional and open.
- **`describe('…the credential behind an entry')`** – Asserts `actorCredentialId` is a known schema path (so strict-mode writes don't drop it) but is not required.
- **`describe('…options')`** – Asserts `timestamps: false` + required `timestamp` (emitter-stamped) and `bufferCommands: false` (a failed write must reject so the caller's fallback fires).
- **`describe('…indexes and retention')`** – Asserts the exact four index specs (three compound `field_1_timestamp_-1` plus `timestamp_1`), the TTL `expireAfterSeconds` on *only* the `timestamp_1` index, and that the TTL index is single-field ascending (a Mongo requirement).

## Relationships

- **`src/modules/audit-logs/model.ts`** — Source of `auditLogSchema`, the sole system under test. Every assertion in this file is a contract on that exported schema object.
- **`src/infrastructure/config/store.ts`** — Provides `currentEnvironment()`, from which `RETENTION_SECONDS` is derived. The test's TTL expectation shifts with the `NODE_AUDIT_RETENTION_DAYS` env var.
- **`tests/support/schema.ts`** — Supplies the six inspection helpers (`enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathNames`, `requiredPaths`) that extract structured facts from a Mongoose schema without serialising it.

## Notes

- **TTL index direction matters.** Mongo only honours `expireAfterSeconds` on a single-field *ascending* index. The same `timestamp` field appears *descending* in the three compound indexes; confusing the two yields an index that never deletes. The test explicitly asserts `timestamp_1: timestamp+1` to guard against this.
- **`bufferCommands: false` is load-bearing.** The caller (`audit-logs` module) relies on the write *rejecting* so it can fall back to local logging and increment `auditSinkFailuresTotal`. A buffered-then-resolved write would silently lose the entry and the signal.
- **Retention is env-driven, not hardcoded.** Changing `NODE_AUDIT_RETENTION_DAYS` moves the schema's TTL and this test's expectation together; a literal `7776000` in the test would drift.
- **This file is intentionally verbose in its comments.** Each assertion carries the *operational rationale* (what goes wrong if the constraint is dropped), making it serve as both test and documentation of the audit-log contract.
