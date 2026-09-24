---
source: src/modules/audit-logs/model.ts
sha256: 1bc2bd98ea9e451a2a1259f0c2eb15e779cba275ef174f5432e707110f1eb0ed
generated_at: 2026-09-23T18:26:50.041722+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/model.ts

## Purpose

Defines the Mongoose schema, indexes, TTL, and serialization transform for the persisted audit-log collection. It is the queryable, durable half of the audit system: the structured log line (emitted by `@infrastructure/observability/audit`) remains the compliance record, while this collection exists so `GET /observability/audit` can answer "what has actor X done" via the API.

## Key elements

- **`AuditLogDocument`** — `Document` + `Omit<AuditEntry, 'action'>` with `action` widened to `string`. Type-only import of `AuditEntry` means no runtime dependency on the audit sink.
- **`AuditLogModel`** — Mongoose `Model` type alias for the document.
- **`retentionDays`** — Read once at import time from `NODE_AUDIT_RETENTION_DAYS` (default 90, min 1) via `environmentNumber`; feeds the TTL index.
- **`auditLogSchema`** — snake_case fields (deliberately not camelCase: returned verbatim as `AuditEventItem` in `openapi.yaml`). Notable choices: `actor_role` is a closed enum while `actor_role_name` is an open string; `actor_scope` is optional for backward compatibility; `metadata` is `Schema.Types.Mixed`; `timestamps: false`; `bufferCommands: false`.
- **Compound indexes** — `{ actor_user_id, timestamp: -1 }`, `{ action, timestamp: -1 }`, `{ target_id, timestamp: -1 }`. All include descending timestamp because every query sorts newest-first.
- **TTL index** — `{ timestamp: 1 }` with `expireAfterSeconds` derived from `retentionDays`.
- **`applyAuditLogTransform`** — Built via `applySerialization`; drops `_id`/`__v` (no per-entry endpoint exists), disables Mongoose `id` virtual, converts `timestamp` to ISO-8601 string.
- **`auditLogModel`** — The registered Mongoose model (`'AuditLog'`), the single entrypoint consumed by the repository.

## Relationships

- **`@infrastructure/observability/audit`** — Type-only import of `AuditEntry`; the document shape is derived from it so the two stay in lock-step without restating fields.
- **`@infrastructure/persistence/serialize`** — `applySerialization` is called here to build `applyAuditLogTransform`.
- **`@infrastructure/runtime/environment`** — `environmentNumber` supplies the retention value at import time.
- **`src/modules/audit-logs/repository.ts`** — Reads through `auditLogModel` to serve the audit query endpoints.
- **`src/modules/audit-logs/service.ts`** — Writes via the model in a fire-and-forget contract (the rationale for `bufferCommands: false`).
- **`src/modules/audit-logs/index.ts`** — Barrel that re-exports this module's public surface.
- **`src/modules/audit-logs/tests/unit/schema-contract.test.ts`** — Asserts the schema's field set and constraints.
- **`src/modules/audit-logs/tests/unit/retention.test.ts`** — Exercises the TTL/retention logic.
- **`src/modules/audit-logs/tests/integration/repository.test.ts`** — Integration tests that read through the model.
- **`tests/integration/scenarios/shop.test.ts`** and **`scenarios/flows/backdate.ts`** — Scenario tests that generate audit entries implicitly through service calls.

## Notes

- **snake_case on purpose.** Unlike every other model in this codebase, fields are snake_case because they map 1:1 to the `AuditEventItem` shape in `openapi.yaml` and to SIEM log lines. Renaming would require a mapping layer on every read.
- **`action` is `string`, not `AuditAction`.** A row written by an older build may name an action that has since been renamed or retired. Typing it as the narrower union would be an unfalsifiable claim about history.
- **TTL index cannot be altered in place.** Changing `NODE_AUDIT_RETENTION_DAYS` and restarting causes `autoIndex` to fail (Mongo rejects conflicting `expireAfterSeconds`). Run `npm run db:sync` to drop and rebuild the index.
- **`bufferCommands: false` is load-bearing.** Without it, a disconnected Mongo buffers each audit insert for 10 s. Because the write is fire-and-forget, buffering only adds timers that keep workers alive — observed as Jest force-killing a worker in `locale.test.ts` (no DB, every rejected signup buffered an insert).
- **`_id` is dropped, not renamed.** There is no `GET /audit/:id` endpoint; entries are read as a stream. Exposing an id would invite one to be built. `virtuals: false` prevents Mongoose's free `id` virtual from reintroducing it.
- **`timestamps: false`.** The entry carries its own `timestamp` stamped at action time, not write time. A Mongoose-generated `createdAt` would be a near-duplicate that invites queries to pick the wrong one.
