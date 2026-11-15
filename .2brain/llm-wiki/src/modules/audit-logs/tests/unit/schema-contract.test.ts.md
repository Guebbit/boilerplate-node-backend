---
source: src/modules/audit-logs/tests/unit/schema-contract.test.ts
sha256: 8ff32c885676a4c13d896c9119072316a7ef8155addbba4a056a846b074a992e
generated_at: 2026-11-14T19:26:32.194804+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose

Contract tests for `auditLogSchema` that lock down the compliance-critical guarantees: which fields are mandatory, which values are closed enums, the two schema options that make audit writes fail-fast rather than buffer, and the exact index set including the sole TTL-based deletion path in the codebase. The file exists so that a casual refactor of the model cannot silently drop a required field, open an enum, enable buffering, or misconfigure the retention index.

## Key elements

- **`RETENTION_SECONDS`** — computed at module load from `currentEnvironment().NODE_AUDIT_RETENTION_DAYS` (fallback 180) so the TTL assertion always tracks the live config.
- **`describe('… what an entry must carry')`** — asserts the seven required paths, the closed enums on `actorRole`, `outcome`, `level`; verifies `anonymous` is a valid role; confirms `actorRoleName` is present, optional, and un-enumerated.
- **`describe('… the credential behind an entry')`** — asserts `actorCredentialId` is a schema path but not required.
- **`describe('… options')`** — asserts `timestamps: false` + required `timestamp`, and `bufferCommands: false`.
- **`describe('… indexes and retention')`** — asserts the exact five-index set, that only `timestamp_1` carries `expireAfterSeconds`, and that it is single-field ascending (the shape Mongo requires for TTL).

## Relationships

- **`src/modules/audit-logs/model.ts`** — source of `auditLogSchema`, the single object under test.
- **`tests/support/schema.ts`** — provides the assertion helpers (`requiredPaths`, `enumOf`, `pathNames`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) that inspect the Mongoose schema introspection API.
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment()` so the retention window in the test stays in lockstep with the deployed configuration.

## Notes

- The TTL index **must** be a single-field ascending index; the same `timestamp` field appears descending in compound indexes, and confusing the two yields an index that silently never expires documents. The dedicated test for this exists to catch exactly that.
- `RETENTION_SECONDS` is derived from the environment, not a literal, so updating `NODE_AUDIT_RETENTION_DAYS` in config moves both the runtime policy and this test together.
- `bufferCommands: false` is load-bearing: the caller's fallback (log the entry to stdout and increment `auditSinkFailuresTotal`) only fires if the write **rejects**; a buffered-then-later-resolved write would suppress that signal and lose the entry silently.
