# src/modules/audit-logs/model.ts

## Purpose

Mongoose model, schema, and serialization transform for the persisted audit-log collection. It is the durable, queryable half of the audit system: the log line (written by `@infrastructure/observability/audit`) is the compliance record, while this collection exists so `GET /observability/audit` can answer "what has actor X done" from the API. Fields use **snake_case** deliberately — the document is returned verbatim as `AuditEventItem` in `openapi.yaml` and must match the shape a SIEM ingests.

## Key elements

- **`AuditLogDocument`** – `Document & Omit<AuditEntry, 'action'>` with `action` widened to `string`. Derived from `AuditEntry` (type-only import) so the two stay the same shape without duplication; the widening accounts for historical rows written by older builds.
- **`AuditLogModel`** – Mongoose `Model<AuditLogDocument>` type alias.
- **`auditLogSchema`** – Schema with `timestamps: false` (the entry stamps its own `timestamp` at action time) and `bufferCommands: false` (offline writes fail fast instead of queueing, since `record()` is fire-and-forget). Defines three indexes: two compound query indexes (`actor_user_id + timestamp desc`, `action + timestamp desc`) and a TTL index on `timestamp`.
- **`retentionDays`** – Read once at import from `NODE_AUDIT_RETENTION_DAYS` (default 90). Consumed only by the TTL index at startup.
- **`applyAuditLogTransform`** – Serialization for the admin dashboard. Drops `_id`/`__v`, disables Mongoose's `id` virtual, and converts `timestamp` to an ISO-8601 string to match `openapi.yaml`.
- **`auditLogModel`** – The `model('AuditLog', …)` entrypoint consumed by the repository layer.

## Relationships

- **`@infrastructure/observability/audit.ts`** – Source of the `AuditEntry` type (type-only import). No runtime dependency; the sink writes what it is handed and this model reads what was written, with no translation in either direction.
- **`@infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which `applyAuditLogTransform` wraps with audit-specific options.
- **`@infrastructure/runtime/environment.ts`** – Provides `environmentNumber`, used to read `NODE_AUDIT_RETENTION_DAYS` at import time.
- **`src/modules/audit-logs/repository.ts`** – Consumes `auditLogModel` for CRUD operations against the collection.
- **`src/modules/audit-logs/service.ts`** – Calls the repository; its `record()` method is the fire-and-forget contract that motivates `bufferCommands: false`.
- **Tests** (`schema-contract`, `retention`, `service`, `repository` integration) – Verify field-level contract, TTL behaviour, service integration, and repository persistence respectively.

## Notes

- **snake_case is intentional and non-negotiable.** Renaming fields to camelCase would require a read-time mapping on every query response. Do not "fix" the naming.
- **TTL index is not hot-reloadable.** Mongo does not modify an existing TTL index's `expireAfterSeconds`. Changing `NODE_AUDIT_RETENTION_DAYS` requires a `collMod` migration under `db/migrations/`; a restart alone is insufficient.
- **`bufferCommands: false` is a deliberate exception.** Every other collection in this codebase buffers to ride out reconnections. Here, buffering was causing a 10 s timer per audited request to hold the event loop open (surfaced as a Jest worker-exit failure in `locale.test.ts`). The log line is the compliance record; the DB row is a queryable convenience.
- **No `id` virtual exists on purpose.** Entries are read as a stream only; there is no `GET /…/:id` endpoint and there should not be. Exposing an id would invite one.
- **`metadata` is `Schema.Types.Mixed` by design.** The audit vocabulary is open-ended; typing it would require a schema change for every new call site.
