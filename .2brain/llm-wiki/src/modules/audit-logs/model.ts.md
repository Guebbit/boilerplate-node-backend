---
source: src/modules/audit-logs/model.ts
sha256: 4a491dca696412aebb40be9a0c224b41cd039fc1c0433349589a42b321273d20
generated_at: 2026-11-14T19:24:04.985466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/model.ts

## Purpose

Defines the Mongoose schema, indexes, and serialization transform for the persisted audit trail. It is the durable half of the observability audit system: the in-memory audit logger (`@infrastructure/observability/audit`) produces the compliance record, while this collection lets `GET /observability/audit` answer "what has actor X done" as a queryable, TTL-bounded MongoDB collection.

## Key elements

- **`AuditLogDocument`** — Document interface derived from `AuditEntry` (type-only import) but widening `action` to `string` so historical rows written by older builds (renamed/retired actions) remain readable.
- **`AuditLogModel`** — `Model<AuditLogDocument>` type alias for the registered Mongoose model.
- **`retentionDays`** — Captured at import time from `auditLogsConfig().NODE_AUDIT_RETENTION_DAYS`; feeds the TTL index.
- **`auditLogSchema`** — Full Mongoose schema. Notable options: `timestamps: false` (entries carry their own action-time `timestamp`), `bufferCommands: false` (fail fast on offline writes rather than queueing).
- **Compound indexes** (all with `timestamp: -1`): `{actorUserId, timestamp}`, `{action, timestamp}`, `{targetId, timestamp}`, `{subjectId, timestamp}` — one per filtered query shape the endpoint supports.
- **TTL index** — `{timestamp: 1}` with `expireAfterSeconds: retentionDays * DAY_SECONDS`; Mongo auto-deletes expired entries.
- **`applyAuditLogTransform`** — Serialization via `applySerialization`; drops `_id`/`__v`, disables Mongoose `id` virtual, converts `timestamp` to ISO-8601 string.
- **`auditLogModel`** — The registered `model('AuditLog', …)` entry point consumed by the service/repository layer.

## Relationships

- **`@infrastructure/observability/audit`** — Type-only import of `AuditEntry` (no runtime dependency on the sink); value imports of `AUDIT_ACTOR_ROLES`, `AUDIT_LEVELS`, `AUDIT_OUTCOMES` for schema enum validation.
- **`@infrastructure/persistence/serialize`** — Provides `applySerialization` used to build `applyAuditLogTransform`.
- **`@types`** — Provides `AUTHORIZATION_SCOPES` for the `actorScope` enum.
- **`./config`** — Provides `auditLogsConfig()` for the retention-days value.
- **`@domain-primitives/time`** — Provides `DAY_SECONDS` to convert retention days to the TTL index's `expireAfterSeconds`.
- **`./service` / `./repository` / `./index`** — Downstream consumers of `auditLogModel` and `applyAuditLogTransform` for recording and querying entries.
- **Tests** (`schema-contract`, `retention`, `service`, `repository`, integration tests) — Verify shape, TTL behavior, and round-trip serialization against this schema.

## Notes

- **TTL index is immutable in-place.** Changing `NODE_AUDIT_RETENTION_DAYS` and restarting will fail boot (`autoIndex` conflicts with the existing index). Run `npm run db:sync` to drop and rebuild.
- **`action` is intentionally `string`, not the `AuditAction` union.** A row written by a previous build may reference a since-renamed action; typing the read as the narrower union would be an unenforceable claim about history.
- **`actorRole` is enum-closed, `actorRoleName` is open.** A renamed or new preset role never requires a migration on the `actorRoleName` field.
- **`metadata` is `Schema.Types.Mixed`.** Free-form by design; typing it would require a schema change per new call site.
- **No individual audit entry endpoint.** `_id`/`__v` are dropped from the serialized shape (and the `id` virtual disabled) precisely because entries are read as a stream, never addressed individually.
