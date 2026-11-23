---
source: src/modules/audit-logs/tests/unit/schema-contract.test.ts
source_sha256: 6ac753cb85c09eca73e90a5418aef24cde54e62a76984fb844dabaa323e05aae
context_sha256: 7058b803c7a0d1f2cc4cacaa0d8fe8bc0253d34843057268d03d27b70487667f
generated_at: 2026-11-22T04:28:57.802151+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose
Unit test that pins the contract of `auditLogSchema` (the audit-log Mongoose schema). It treats the schema as a compliance artifact: required fields, closed enums, timestamp/buffering options, and indexes including the TTL retention index. It checks the schema definition only, with no database involved.

## Key elements
- `RETENTION_SECONDS` — computed from `currentEnvironment().NODE_AUDIT_RETENTION_DAYS` (default 180 days) × 86400. The TTL assertion compares against this value, not a literal.
- **What an entry must carry** — `requiredPaths` must be exactly `action`, `actorRole`, `actorScope`, `actorUserId`, `level`, `outcome`, `timestamp`.
  - `actorRole` is restricted to `admin | user | anonymous | system`, `outcome` to `success | failure`, and `level` to `info | warn`.
  - `anonymous` must be present so unauthenticated events (e.g. a failed login) remain attributable.
  - `actorRoleName` exists, is not required, and has no enum, so renaming a preset role can't fail a write.
- **Credential** — `actorCredentialId` exists and is optional (the API-key id).
- **Options** — `timestamps: false` with a required `timestamp` (the entry is stamped when the event happens, not when it is written), and `bufferCommands: false`, so an unreachable database makes the write reject instead of buffering. The caller's fallback of logging the entry depends on that rejection.
- **Indexes and retention**
  - `indexSpecs` must equal four compound `<field>_1_timestamp_-1` indexes (`action`, `actorUserId`, `subjectId`, `targetId`) plus `timestamp_1`.
  - `indexOptionSpecs` must show `expireAfterSeconds=${RETENTION_SECONDS}` on `timestamp_1` only, and `(none)` on the others.
  - `timestamp_1` must be a single-field ascending index, the direction TTL requires.

## Relationships
- `src/modules/audit-logs/model.ts` — provides `auditLogSchema`, the sole subject under test.
- `tests/support/schema.ts` — imported as `@tests/schema`. It supplies the introspection helpers `enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathNames` and `requiredPaths`.
- `src/infrastructure/config/store.ts` — `currentEnvironment()` supplies `NODE_AUDIT_RETENTION_DAYS` for the expected TTL.

## Notes
- The test's `?? 180` default is meant to mirror the model's own default. If the two diverge, the TTL assertion would fail.
- Index and required-path assertions use exact array equality, so adding, removing or reordering any index or required field requires updating this test.
- The index spec strings use the format `name: field+1, timestamp-1`, as produced by the helpers.
