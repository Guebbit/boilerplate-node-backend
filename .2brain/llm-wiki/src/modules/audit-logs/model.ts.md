---
source: src/modules/audit-logs/model.ts
sha256: 068c6780ee065c1d34c46f3cf4cd7e65e8e41e0def373af85f29ee5c80ab38af
generated_at: 2026-09-27T14:42:35.146035+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/model.ts

## Purpose

Mongoose schema, model, and serialization transform for the persisted audit-log collection. It is the durable half of the audit pipeline: the logger in `@infrastructure/observability/audit` decides *what* to record, and this file defines the shape, indexes, TTL, and read-path serialization so `GET /observability/audit` can answer "what has actor X done" from the API.

## Key elements

- **`AuditLogDocument`** — `Document` + `Omit<AuditEntry, 'action'>` with `action` widened to `string`. Derives fields from the logger's `AuditEntry` type (type-only import) rather than restating them, so a field added to the logger compiles against the schema automatically.
- **`AuditLogModel`** — `Model<AuditLogDocument>` type alias for Mongoose model references.
- **`retentionDays`** — read once at import via `environmentNumber('NODE_AUDIT_RETENTION_DAYS', 90, 1)`; feeds the TTL index.
- **`auditLogSchema`** — Mongoose `Schema` with snake_case fields (`actor_user_id`, `action`, `outcome`, `timestamp`, etc.). Notable options: `timestamps: false` (the entry carries its own action-time `timestamp`), `bufferCommands: false` (fail fast when the DB is unreachable rather than queueing).
- **Indexes** — three compound indexes (`actor_user_id`, `action`, `target_id`) each paired with `timestamp: -1` to match the three filtered query paths; one TTL index on `timestamp` using `retentionDays`.
- **`applyAuditLogTransform`** — wraps `applySerialization`; drops `_id`/`__v`, disables Mongoose `id` virtual, converts `timestamp` to ISO-8601 string for the OpenAPI response.
- **`auditLogModel`** — the compiled Mongoose model (`model('AuditLog', auditLogSchema)`) used by the repository for reads/writes.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — source of the `AuditEntry` type that `AuditLogDocument` extends. Type-only import; no runtime dependency on the logger.
- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which `applyAuditLogTransform` composes with the audit-specific `after` hook.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber` used to read the retention-days config at import time.
- **`src/modules/audit-logs/repository.ts`** — consumes `auditLogModel` for query and write operations.
- **`src/modules/audit-logs/service.ts`** — higher-level orchestration that calls the repository; the model's `bufferCommands: false` assumption (no caller awaits the write) is documented in the service's contract.
- **`src/modules/audit-logs/index.ts`** — barrel file that re-exports this module's public symbols.
- **`src/modules/audit-logs/tests/unit/schema-contract.test.ts`** — validates the schema's field set and types.
- **`src/modules/audit-logs/tests/unit/retention.test.ts`** — exercises the TTL index configuration.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — unit-tests the service layer that reads through this model.
- **`src/modules/audit-logs/tests/integration/repository.test.ts`** — integration tests that exercise the model against a real database.
- **`scenarios/flows/backdate.ts`** — scenario flow that may write audit entries with historical timestamps, exercising the `timestamp` field directly.
- **`tests/integration/scenarios/shop.test.ts`** — end-to-end scenario that generates audit entries as a side effect of shop actions.

## Notes

- **snake_case on purpose.** Every field is snake_case because the document is returned verbatim as `AuditEventItem` in `openapi.yaml` and must match the log lines a SIEM ingests. Do not "fix" to camelCase without updating the OpenAPI spec and the SIEM mapping.
- **`action` is `string`, not the `AuditAction` union.** Existing rows may name actions that have since been renamed or retired. Typing the read as the narrower union would be an unenforceable claim about history.
- **`actor_role` is a closed enum; `actor_role_name` is open.** The enum covers the three known presets; `actor_role_name` carries any preset string so new or renamed roles don't require a schema migration.
- **`actor_scope` is optional.** Rows written before the field existed remain valid; reads surface as missing rather than failing validation.
- **TTL index caveat.** Mongo refuses to alter an existing TTL index's `expireAfterSeconds`. Changing `NODE_AUDIT_RETENTION_DAYS` and restarting will **fail boot** (`autoIndex` conflict). Run `npm run db:sync` to drop and rebuild the index.
- **No `id` in the response.** `dropId: true` + `virtuals: false` are paired deliberately: audit entries have no individual endpoint (`GET /observability/audit/:id` does not exist), so exposing an id would invite one to be built. Mongoose's free `id` virtual is disabled to prevent it from sneaking back in.
- **`timestamps: false`.** The entry's `timestamp` is the action time, not the write time. Mongoose's `createdAt` would add a near-identical second field and invite queries to pick the wrong one.
- **`bufferCommands: false`.** Nothing awaits the audit write. Mongoose's default 10-second command buffer would turn an unreachable database into a pending timer per audited request instead of an immediate failure.
