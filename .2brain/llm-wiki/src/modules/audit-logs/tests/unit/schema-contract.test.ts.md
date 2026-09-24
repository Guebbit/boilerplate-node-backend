---
source: src/modules/audit-logs/tests/unit/schema-contract.test.ts
sha256: 59ef51f3aea9a7c46c29e4962c14c70bc7a7b1a1ce0b4ef10cb379828c387370
generated_at: 2026-09-23T18:28:22.316604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose

Contract tests that lock down the Mongoose schema for audit-log entries: which fields are required, which fields are restricted to closed enum sets, which Mongoose options are set (`timestamps`, `bufferCommands`), and which indexes exist with what options (including the single TTL index). The file exists to make schema drift visible as a test failure rather than a silent production gap.

## Key elements

- **`RETENTION_SECONDS`** – Derived from `NODE_AUDIT_RETENTION_DAYS` (default 90 days) into seconds. Used in the TTL assertion so the test tracks the configured value rather than a hardcoded literal.
- **"what an entry must carry" block** – Asserts the six required paths (`action`, `actor_role`, `actor_user_id`, `level`, `outcome`, `timestamp`); validates closed enums on `actor_role`, `outcome`, `level`; confirms `anonymous` is present in the role enum; confirms `actor_role_name` exists as an open, optional path (no enum, not required).
- **"options" block** – Asserts `timestamps: false` (timestamp comes from the event, not the write) and `bufferCommands: false` (an unreachable DB must reject the write so the caller can fall back to local logging).
- **"indexes and retention" block** – Asserts the exact set of four indexes and their order; asserts that only `timestamp_1` carries `expireAfterSeconds`; asserts that `timestamp_1` is ascending (Mongo only honours TTL on a single-field ascending index, while the compound indexes use `timestamp_-1`).

## Relationships

- **`src/modules/audit-logs/model.ts`** – Source of `auditLogSchema`, the sole subject under test. Every assertion in this file inspects that schema's paths, options, and index definitions.
- **`tests/support/schema.ts`** – Provides the introspection helpers (`requiredPaths`, `enumOf`, `pathNames`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) that extract schema metadata as plain data, letting these tests assert against values rather than re-implementing Mongoose introspection.

## Notes

- The TTL index assertion is the only place in the codebase where the DB is allowed to delete documents. The test deliberately asserts against `RETENTION_SECONDS` (env-derived) so changing `NODE_AUDIT_RETENTION_DAYS` moves both the schema default and the test together.
- The ascending vs. descending distinction on `timestamp` is load-bearing: Mongo ignores `expireAfterSeconds` on a descending or compound index. The final test in the "indexes" block exists specifically to catch that confusion.
- `actor_role` (closed enum) and `actor_role_name` (open, optional) are intentionally different: the name mirrors the value in `authorization-roles.yaml` and must not break writes when a preset role is renamed.
