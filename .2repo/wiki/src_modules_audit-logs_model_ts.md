# src/modules/audit-logs/model.ts

## Purpose

Mongoose model for the persisted audit-trail collection. It is the queryable, durable half of the audit system: it exists so `GET /observability/audit` can answer "what has actor X done" from the API without a log backend (Loki/file) being wired up. It replaced a 200-entry in-process ring buffer that was per-worker, per-restart, and shared across all actors.

## Key elements

- **`AuditLogDocument`** — Interface extending Mongoose `Document`. Derived from `AuditEntry` (type-only import from `@infrastructure/observability/audit`) with `action` widened from the `AuditAction` union to `string`, because historical rows may carry renamed/retired actions.
- **`AuditLogModel`** — `Model<AuditLogDocument>` type alias for use in schema/model generics.
- **`retentionDays`** — Read once at import time via `environmentNumber('NODE_AUDIT_RETENTION_DAYS', 90, 1)`; feeds the TTL index.
- **`auditLogSchema`** — Mongoose `Schema` with snake_case fields (`actor_user_id`, `actor_role`, `action`, `outcome`, `ip`, `user_agent`, `request_id`, `trace_id`, `target_type`, `target_id`, `metadata`, `timestamp`, `level`). Notable options: `timestamps: false` (entry carries its own action-time timestamp), `bufferCommands: false` (fire-and-forget; never queue while Mongo is down). Defines two compound indexes (`{actor_user_id, timestamp:-1}`, `{action, timestamp:-1}`) and a TTL index on `timestamp`.
- **`applyAuditLogTransform`** — Serialization config built with `applySerialization`: drops `_id`/`__v`, disables virtuals, converts `timestamp` to an ISO-8601 string.
- **`auditLogModel`** — The registered Mongoose model (`'AuditLog'`), the import entrypoint for repository/service code.

## Relationships

- **`@infrastructure/observability/audit`** — Type-only import of `AuditEntry`; `AuditLogDocument` is a structural widening of it. No runtime dependency.
- **`@infrastructure/persistence/serialize`** — Provides `applySerialization` used to build `applyAuditLogTransform`.
- **`@infrastructure/runtime/environment`** — Provides `environmentNumber` for the retention-days default.
- **`src/modules/audit-logs/repository.ts`** — Consumes `auditLogModel` / `AuditLogDocument` for read and write operations.
- **`src/modules/audit-logs/service.ts`** — Higher-level service that calls the repository; its `record` call is the fire-and-forget path that motivated `bufferCommands: false`.
- **Tests** (`repository.test.ts`, `retention.test.ts`, `service.test.ts`) — Exercise the model, retention TTL logic, and the service layer against this schema.

## Notes

- **Field naming is snake_case on purpose.** The names match the `AuditEventItem` shape in `openapi.yaml`, which in turn mirrors the log-line keys a SIEM ingests. Renaming would require a mapping layer and break the admin dashboard.
- **`action` is `string`, not `AuditAction`.** A row written by an older build may name a since-retired action; typing reads as the narrow union would be an unenforceable claim about history.
- **`bufferCommands: false` is a deliberate exception** to the codebase default. Audit writes are fire-and-forget (the log line is the compliance record), so buffering only adds a 10 s timer per audited request during outages. It was diagnosed via a Jest worker that would not exit.
- **TTL index is not hot-reloadable.** Changing `NODE_AUDIT_RETENTION_DAYS` after the index exists does nothing; you must drop and recreate it (use a migration under `db/migrations/` with `collMod`).
- **`_id` is dropped, not renamed.** Audit entries have no per-document endpoint; exposing an id would invite one to be built. `virtuals` is explicitly off to prevent Mongoose's free `id` virtual from sneaking it back.
