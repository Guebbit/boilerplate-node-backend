# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose

Compliance test that pins the audit-log schema's structural contract: which fields are mandatory, which enums are closed, which Mongoose options are set, and which indexes (including the TTL) exist. It treats the schema as a security artifact rather than a convenience, so that silent drift—missing fields, open-ended enums, a buffering write, or a misconfigured TTL—fails loudly instead of degrading audit coverage.

## Key elements

- **`RETENTION_SECONDS`** — module-level constant; `NODE_AUDIT_RETENTION_DAYS` (default 90) × 86 400. Mirrors the model's own default so the test and the policy move together if the env var changes.
- **`describe('…what an entry must carry')`** — asserts the six required paths (`action`, `actor_role`, `actor_user_id`, `level`, `outcome`, `timestamp`) and the closed enum sets for `actor_role`, `outcome`, and `level`. Includes a dedicated assertion that `anonymous` is a valid role.
- **`describe('…options')`** — asserts `timestamps: false` + required `timestamp` (entry is stamped by the emitter, not the writer) and `bufferCommands: false` (an unreachable DB must reject so the caller's fallback path fires).
- **`describe('…indexes and retention')`** — asserts the three index specs, the TTL (`expireAfterSeconds`) on the `timestamp_1` index only, and that the TTL index is single-field ascending (Mongo requirement).

## Relationships

- **`src/modules/audit-logs/model.ts`** — source of `auditLogSchema`, the unit under test. All assertions inspect this object's fields, options, and index metadata.
- **`tests/support/schema.ts`** — supplies the inspection helpers used throughout: `requiredPaths`, `enumOf`, `optionsOf`, `indexSpecs`, and `indexOptionSpecs`. Without it the tests would need raw Mongoose introspection.

## Notes

- `RETENTION_SECONDS` is read from the environment at test time, not frozen. Changing `NODE_AUDIT_RETENTION_DAYS` in CI or locally shifts both the model's default and the expected TTL value simultaneously.
- The TTL index **must** be a single-field ascending index (`timestamp: 1`). The two compound indexes also contain `timestamp` but in descending order; confusing them produces an index where Mongo silently never expires documents.
- The `anonymous` role assertion exists because a failed-login event (the most security-critical entry) has no authenticated user; without it, the entry that matters most has no `actor_role` to record.
