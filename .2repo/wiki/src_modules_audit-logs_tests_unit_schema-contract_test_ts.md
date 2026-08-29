# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose

Locks down the audit-log schema as a compliance contract: required fields, closed enum sets, Mongoose options (`timestamps`, `bufferCommands`), and index/TTL configuration. Because the audit-log collection is the one in the system whose schema is a policy artifact rather than a convenience, these invariants are asserted explicitly so that any accidental change to the model is caught at test time.

## Key elements

- **`RETENTION_SECONDS`** – Computed from `NODE_AUDIT_RETENTION_DAYS` (default 90) × 86400. Used to assert the TTL index's `expireAfterSeconds` against the configured value rather than a literal.
- **`describe('what an entry must carry')`** – Asserts the six required paths (`action`, `actor_role`, `actor_user_id`, `level`, `outcome`, `timestamp`) and the closed enum sets for `actor_role`, `outcome`, and `level`. Verifies `anonymous` is a valid role.
- **`describe('options')`** – Asserts `timestamps: false` (entry is stamped at event time, not write time) and `bufferCommands: false` (a failed write rejects so the caller's fallback can fire).
- **`describe('indexes and retention')`** – Asserts the exact set of three indexes (two compound descending-by-timestamp, one ascending single-field), the TTL `expireAfterSeconds` value, and that the TTL index is the ascending `timestamp_1` form Mongo requires for expiry.

## Relationships

- **`src/modules/audit-logs/model.ts`** — Source of `auditLogSchema`, the sole object under test. Every assertion in this file reads properties, options, and index metadata off that schema instance.
- **`tests/support/schema.ts`** — Provides the introspection helpers this file uses to read the schema without instantiating a model: `requiredPaths`, `enumOf`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`.

## Notes

- The TTL retention assertion is parameterised on `NODE_AUDIT_RETENTION_DAYS`, so changing that env var moves the schema default and the test expectation together. A TTL appearing on any index other than `timestamp_1` will fail the `indexOptionSpecs` check.
- The dedicated "ascending direction" test exists because Mongo only honours `expireAfterSeconds` on a single-field ascending index; a descending or compound index on `timestamp` would compile silently but never delete documents.
- All five "enrichment" fields (IP, user-agent, request/trace IDs, target, metadata) are intentionally **not** in the required set; the test pins that only the six answerability fields are mandatory.
